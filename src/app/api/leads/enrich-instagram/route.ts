import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { InstagramAdapter } from '@/infra/scrapers/instagram.adapter'
import { calculateNeedScore } from '@/core/scoring/need-score'
import { logger } from '@/lib/logger'
import {
  extractInstagramFromUrl,
  extractInstagramFromHtml,
  guessInstagramCandidates,
  extractWebsiteDomain,
} from '@/lib/instagram-utils'
import { buildGoogleSignals, buildWebsiteSignals, buildMarketingSignals } from '@/lib/signal-builders'
import type { Lead } from '@/types/database'
import type { RawLeadData } from '@/types/lead'
import type { InstagramSignals } from '@/types/scoring'

export const maxDuration = 300 // 5 dakika timeout

/**
 * Instagram zenginleştirme endpoint'i
 *
 * 3 katmanlı strateji:
 * 1. Website URL'si doğrudan Instagram linki mi?
 * 2. Website HTML'inden Instagram linki çıkar
 * 3. Aday üretimi + Apify doğrulama
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const districtId: string | undefined = body.district_id
    const batchLimit: number = body.limit ?? 50

    const supabase = createServiceRoleClient()

    const limit = Math.min(batchLimit, 500)
    const { leads, error } = await loadPendingInstagramLeads(supabase, districtId, limit)

    if (error) {
      logger.error('Instagram zenginleştirme: lead\'ler getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        message: 'Zenginleştirilecek veya yeniden denenecek lead bulunamadı',
        enriched: 0,
        processed: 0,
        unmatched: 0,
        remaining: 0,
      })
    }

    const adapter = new InstagramAdapter()
    const isAvailable = await adapter.isAvailable()

    if (!isAvailable) {
      return NextResponse.json(
        { error: 'Instagram API (Apify) yapılandırılmamış. APIFY_API_TOKEN gerekli.' },
        { status: 503 }
      )
    }

    let enriched = 0

    for (const lead of leads as Lead[]) {
      try {
        const profileData = await discoverInstagramProfile(lead, adapter)

        // Instagram bulunamadıysa boş string ile işaretle (tekrar denemeyi önle)
        if (!profileData?.igUsername) {
          await supabase
            .from('leads')
            .update({ ig_username: '' })
            .eq('id', lead.id)
          continue
        }

        // Lead'i Instagram verileriyle güncelle
        const { error: igUpdateError } = await supabase
          .from('leads')
          .update({
            ig_username: profileData.igUsername,
            ig_follower_count: profileData.igFollowerCount,
            ig_post_count: profileData.igPostCount,
            ig_avg_likes: profileData.igAvgLikes,
            ig_last_post_date: profileData.igLastPostDate,
            ig_has_highlights: profileData.igHasHighlights,
            ig_bio_contains_agency: profileData.igBioContainsAgency,
            ig_has_bio_link: profileData.igHasBioLink,
            ig_engagement_rate: profileData.igEngagementRate,
            ig_posting_regularity: profileData.igPostingRegularity,
          })
          .eq('id', lead.id)

        if (igUpdateError) {
          logger.warn('Instagram verileri güncellenemedi', { leadId: lead.id, error: igUpdateError.message })
          continue
        }

        // Puanı yeniden hesapla
        const google = buildGoogleSignals(lead)
        const instagram: InstagramSignals = {
          exists: true,
          lastPostDate: profileData.igLastPostDate ? new Date(profileData.igLastPostDate) : null,
          avgLikes: profileData.igAvgLikes ?? null,
          postCount: profileData.igPostCount ?? null,
          hasHighlights: profileData.igHasHighlights ?? null,
          bioContainsAgency: profileData.igBioContainsAgency ?? null,
          hasBioLink: profileData.igHasBioLink ?? null,
          followerCount: profileData.igFollowerCount ?? null,
          postingRegularity: profileData.igPostingRegularity ?? null,
          engagementRate: profileData.igEngagementRate ?? null,
          reelsRatio: null,
        }
        const website = buildWebsiteSignals(lead)
        const marketing = buildMarketingSignals(lead)

        const score = calculateNeedScore({ google, instagram, website, marketing })

        const { error: scoreUpdateError } = await supabase
          .from('leads')
          .update({
            need_score: score.totalScore,
            google_sub_score: score.googleSubScore,
            instagram_sub_score: score.instagramSubScore,
            website_sub_score: score.websiteSubScore,
            marketing_sub_score: score.marketingSubScore,
            recommendation: score.recommendation,
          })
          .eq('id', lead.id)

        if (scoreUpdateError) {
          logger.warn('Instagram sonrası puan güncellenemedi', { leadId: lead.id, error: scoreUpdateError.message })
        }

        enriched++
      } catch (err) {
        logger.warn('Instagram profil analizi hatası', {
          leadId: lead.id,
          error: String(err),
        })
      }
    }

    const remainingCount = await countPendingInstagramLeads(supabase, districtId)
    const processed = leads.length
    const unmatched = processed - enriched

    logger.info('Instagram zenginleştirme tamamlandı', { enriched, total: leads.length, remaining: remainingCount })

    return NextResponse.json({
      message: 'Instagram zenginleştirme tamamlandı',
      enriched,
      processed,
      unmatched,
      remaining: remainingCount,
    })
  } catch (error) {
    logger.error('Instagram enrich API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

async function loadPendingInstagramLeads(
  supabase: ReturnType<typeof createServiceRoleClient>,
  districtId: string | undefined,
  limit: number
) {
  let freshQuery = supabase
    .from('leads')
    .select('*')
    .is('ig_username', null)
    .order('updated_at', { ascending: true })
    .limit(limit)

  if (districtId) {
    freshQuery = freshQuery.eq('district_id', districtId)
  }

  const { data: freshLeads, error: freshError } = await freshQuery

  if (freshError) {
    return { leads: null, error: freshError }
  }

  const leads = [...(freshLeads ?? [])]

  if (leads.length >= limit) {
    return { leads, error: null }
  }

  let retryQuery = supabase
    .from('leads')
    .select('*')
    .eq('ig_username', '')
    .order('updated_at', { ascending: true })
    .limit(limit - leads.length)

  if (districtId) {
    retryQuery = retryQuery.eq('district_id', districtId)
  }

  const { data: retryLeads, error: retryError } = await retryQuery

  if (retryError) {
    return { leads: null, error: retryError }
  }

  return { leads: [...leads, ...(retryLeads ?? [])], error: null }
}

async function countPendingInstagramLeads(
  supabase: ReturnType<typeof createServiceRoleClient>,
  districtId: string | undefined
) {
  let nullCountQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .is('ig_username', null)

  let emptyCountQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ig_username', '')

  if (districtId) {
    nullCountQuery = nullCountQuery.eq('district_id', districtId)
    emptyCountQuery = emptyCountQuery.eq('district_id', districtId)
  }

  const [{ count: nullCount }, { count: emptyCount }] = await Promise.all([
    nullCountQuery,
    emptyCountQuery,
  ])

  return (nullCount ?? 0) + (emptyCount ?? 0)
}

/**
 * 3 katmanlı Instagram profil bulma
 */
async function discoverInstagramProfile(
  lead: Lead,
  adapter: InstagramAdapter
): Promise<Partial<RawLeadData> | null> {
  // Katman 1: Website URL'si doğrudan Instagram linki mi?
  if (lead.website) {
    const directUsername = extractInstagramFromUrl(lead.website)
    if (directUsername) {
      const profileData = await adapter.analyzeProfile(directUsername)
      if (profileData.igUsername) return profileData
    }
  }

  // Katman 2: Website HTML'inden Instagram linki çıkar
  if (lead.website && !extractInstagramFromUrl(lead.website ?? '')) {
    try {
      const url = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CreviaSalesBot/1.0)' },
      })
      if (response.ok) {
        const html = await response.text()
        const htmlUsername = extractInstagramFromHtml(html)
        if (htmlUsername) {
          const profileData = await adapter.analyzeProfile(htmlUsername)
          if (profileData.igUsername) return profileData
        }
      }
    } catch {
      // Website erişim hatası, Katman 3'e geç
    }
  }

  // Katman 3: Aday üretimi + Apify doğrulama
  const candidates = guessInstagramCandidates(lead)
  if (candidates.length === 0) return null

  const context = { websiteDomain: extractWebsiteDomain(lead.website) }
  return adapter.findBusinessProfile(candidates, lead.business_name, context)
}
