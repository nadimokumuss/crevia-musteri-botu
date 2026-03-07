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

/**
 * Cron job: Her dakika 1 lead zenginleştir
 * Vercel Hobby plan 10 saniye limit - tek lead güvenli
 */
export async function GET(request: NextRequest) {
  // Cron secret kontrolü (opsiyonel güvenlik)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()

    // Website olup ig_username kontrol edilmemiş 1 lead getir
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .is('ig_username', null)
      .not('website', 'is', null)
      .limit(1)

    if (error) {
      logger.error('Cron: lead getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'No leads to process', enriched: 0 })
    }

    const adapter = new InstagramAdapter()
    const isAvailable = await adapter.isAvailable()

    if (!isAvailable) {
      return NextResponse.json({ error: 'Apify not configured' }, { status: 503 })
    }

    const lead = leads[0] as Lead
    let enriched = 0

    try {
      const profileData = await discoverInstagramProfile(lead, adapter)

      if (!profileData?.igUsername) {
        // Bulunamadı - boş string ile işaretle
        await supabase
          .from('leads')
          .update({ ig_username: '' })
          .eq('id', lead.id)
      } else {
        // Instagram bulundu - güncelle
        await supabase
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

        await supabase
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

        enriched = 1
      }
    } catch (err) {
      logger.warn('Cron: Instagram analiz hatası', { leadId: lead.id, error: String(err) })
      // Hata olsa bile işaretle - sonsuz döngü önle
      await supabase
        .from('leads')
        .update({ ig_username: '' })
        .eq('id', lead.id)
    }

    // Kalan sayısı
    const { count: remaining } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .is('ig_username', null)
      .not('website', 'is', null)

    logger.info('Cron: Instagram zenginleştirme', { enriched, remaining })

    return NextResponse.json({ enriched, remaining })
  } catch (error) {
    logger.error('Cron: Genel hata', { error: String(error) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

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
        signal: AbortSignal.timeout(3000), // Cron için daha kısa timeout
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
      // Timeout veya erişim hatası
    }
  }

  // Katman 3: Aday üretimi + Apify doğrulama
  const candidates = guessInstagramCandidates(lead)
  if (candidates.length === 0) return null

  const context = { websiteDomain: extractWebsiteDomain(lead.website) }
  return adapter.findBusinessProfile(candidates, lead.business_name, context)
}
