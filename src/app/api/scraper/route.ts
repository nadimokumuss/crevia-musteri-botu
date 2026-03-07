import { NextRequest, NextResponse } from 'next/server'
import { startScrapeJobSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { createLeadSource } from '@/infra/scrapers/scraper-factory'
import { InstagramAdapter } from '@/infra/scrapers/instagram.adapter'
import { calculateNeedScore } from '@/core/scoring/need-score'
import { logger } from '@/lib/logger'
import {
  extractInstagramFromUrl,
  extractInstagramFromHtml,
  guessInstagramCandidates,
  extractWebsiteDomain,
} from '@/lib/instagram-utils'
import { buildAllSignals } from '@/lib/signal-builders'
import type { ScrapeJobStatus, Lead } from '@/types/database'

// Vercel Hobby plan: max 60 saniye
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = startScrapeJobSchema.parse(body)
    const weeklyPlanId = body.weekly_plan_id as string | undefined
    const skipInstagram = body.skip_instagram === true

    const supabase = createServiceRoleClient()

    // Scrape job kaydı oluştur
    const { data: job, error: insertError } = await supabase
      .from('scrape_jobs')
      .insert({
        district_id: parsed.district_id,
        source_adapter: parsed.source_adapter,
        category: parsed.category,
        status: 'PENDING' as ScrapeJobStatus,
        ...(weeklyPlanId ? { weekly_plan_id: weeklyPlanId } : {}),
      })
      .select()
      .single()

    if (insertError) {
      logger.error('Scrape job oluşturulamadı', { error: insertError.message })
      return NextResponse.json({ error: 'Scrape job oluşturulamadı' }, { status: 500 })
    }

    // Senkron çalıştır — fonksiyon iş bitene kadar hayatta kalır
    await runScrapeJob(job.id, parsed.district_id, parsed.source_adapter, parsed.category, skipInstagram, parsed.limit)

    return NextResponse.json({ jobId: job.id, status: 'COMPLETED' }, { status: 201 })
  } catch (error) {
    logger.error('Scraper API hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')

    const supabase = createServiceRoleClient()

    if (jobId) {
      const { data, error } = await supabase
        .from('scrape_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Job bulunamadı' }, { status: 404 })
      }

      return NextResponse.json(data)
    }

    // Son 20 job'u listele
    const { data, error } = await supabase
      .from('scrape_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Scraper status API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

async function runScrapeJob(
  jobId: string,
  districtId: string,
  sourceAdapter: string,
  category?: string,
  skipInstagram = false,
  limit?: number,
) {
  const supabase = createServiceRoleClient()

  // Job'u RUNNING olarak güncelle
  await supabase
    .from('scrape_jobs')
    .update({ status: 'RUNNING' as ScrapeJobStatus, started_at: new Date().toISOString() })
    .eq('id', jobId)

  try {
    // İlçe adını DB'den çek
    const { data: district } = await supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .single()

    const adapter = createLeadSource(sourceAdapter as 'google-places' | 'apify' | 'instagram')
    const result = await adapter.search({ districtId, districtName: district?.name, category, limit })

    let leadsNew = 0
    let leadsUpdated = 0
    const affectedLeadIds: string[] = []

    for (const lead of result.leads) {
      // Mevcut lead'i kontrol et (google_place_id veya ig_username ile)
      if (lead.googlePlaceId) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('google_place_id', lead.googlePlaceId)
          .single()

        if (existing) {
          await supabase
            .from('leads')
            .update({
              business_name: lead.businessName,
              category: lead.category ?? category,
              address: lead.address,
              phone: lead.phone,
              email: lead.email,
              website: lead.website,
              lat: lead.lat,
              lng: lead.lng,
              google_rating: lead.googleRating,
              google_review_count: lead.googleReviewCount,
              google_photo_count: lead.googlePhotoCount,
              google_is_claimed: lead.googleIsClaimed,
            })
            .eq('id', existing.id)
          affectedLeadIds.push(existing.id)
          leadsUpdated++
        } else {
          const { data: inserted } = await supabase.from('leads').insert({
            district_id: districtId,
            business_name: lead.businessName,
            category: lead.category ?? category,
            address: lead.address,
            phone: lead.phone,
            email: lead.email,
            website: lead.website,
            lat: lead.lat,
            lng: lead.lng,
            google_place_id: lead.googlePlaceId,
            google_rating: lead.googleRating,
            google_review_count: lead.googleReviewCount,
            google_photo_count: lead.googlePhotoCount,
            google_is_claimed: lead.googleIsClaimed,
          }).select('id').single()
          if (inserted) affectedLeadIds.push(inserted.id)
          leadsNew++
        }
      } else if (lead.igUsername) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('ig_username', lead.igUsername)
          .single()

        if (existing) {
          await supabase
            .from('leads')
            .update({
              ig_follower_count: lead.igFollowerCount,
              ig_post_count: lead.igPostCount,
              ig_avg_likes: lead.igAvgLikes,
              ig_last_post_date: lead.igLastPostDate,
              ig_has_highlights: lead.igHasHighlights,
              ig_bio_contains_agency: lead.igBioContainsAgency,
              ig_has_bio_link: lead.igHasBioLink,
              ig_engagement_rate: lead.igEngagementRate,
              ig_posting_regularity: lead.igPostingRegularity,
            })
            .eq('id', existing.id)
          affectedLeadIds.push(existing.id)
          leadsUpdated++
        } else {
          const { data: inserted } = await supabase.from('leads').insert({
            district_id: districtId,
            business_name: lead.businessName,
            ig_username: lead.igUsername,
            ig_follower_count: lead.igFollowerCount,
            ig_post_count: lead.igPostCount,
            ig_avg_likes: lead.igAvgLikes,
            ig_last_post_date: lead.igLastPostDate,
            ig_has_highlights: lead.igHasHighlights,
            ig_bio_contains_agency: lead.igBioContainsAgency,
            ig_has_bio_link: lead.igHasBioLink,
            ig_engagement_rate: lead.igEngagementRate,
            ig_posting_regularity: lead.igPostingRegularity,
          }).select('id').single()
          if (inserted) affectedLeadIds.push(inserted.id)
          leadsNew++
        }
      } else {
        const { data: inserted } = await supabase.from('leads').insert({
          district_id: districtId,
          business_name: lead.businessName,
          category: lead.category ?? category,
          address: lead.address,
          phone: lead.phone,
          email: lead.email,
          website: lead.website,
          lat: lead.lat,
          lng: lead.lng,
        }).select('id').single()
        if (inserted) affectedLeadIds.push(inserted.id)
        leadsNew++
      }
    }

    // Otomatik Instagram zenginleştirme + puanlama
    if (affectedLeadIds.length > 0) {
      if (!skipInstagram) {
        await autoEnrichInstagram(supabase, affectedLeadIds)
      }
      await autoScoreLeads(supabase, affectedLeadIds)
    }

    // Job'u COMPLETED olarak güncelle
    await supabase
      .from('scrape_jobs')
      .update({
        status: 'COMPLETED' as ScrapeJobStatus,
        completed_at: new Date().toISOString(),
        leads_found: result.totalFound,
        leads_new: leadsNew,
        leads_updated: leadsUpdated,
      })
      .eq('id', jobId)

    logger.info('Scrape job tamamlandı', { jobId, leadsNew, leadsUpdated })
  } catch (error) {
    await supabase
      .from('scrape_jobs')
      .update({
        status: 'FAILED' as ScrapeJobStatus,
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Bilinmeyen hata',
      })
      .eq('id', jobId)

    logger.error('Scrape job başarısız', { jobId, error: String(error) })
  }
}

/**
 * Lead'lerin Instagram verilerini 3 katmanlı stratejiyle zenginleştir:
 * 1. Website URL'si doğrudan Instagram linki mi?
 * 2. Website HTML'inden Instagram linki çıkar
 * 3. Aday üretimi + Apify doğrulama
 */
async function autoEnrichInstagram(
  supabase: ReturnType<typeof createServiceRoleClient>,
  leadIds: string[]
) {
  try {
    const adapter = new InstagramAdapter()
    const isAvailable = await adapter.isAvailable()
    if (!isAvailable) {
      logger.info('Instagram zenginleştirme atlandı: APIFY_API_TOKEN yapılandırılmamış')
      return
    }

    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .in('id', leadIds)
      .is('ig_username', null)

    if (!leads || leads.length === 0) return

    let enriched = 0

    for (const lead of leads as Lead[]) {
      try {
        const profileData = await discoverInstagramProfile(lead, adapter)
        if (!profileData) continue

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

        enriched++
      } catch (err) {
        logger.warn('Otomatik IG zenginleştirme hatası', {
          leadId: lead.id,
          error: String(err),
        })
      }
    }

    logger.info('Otomatik Instagram zenginleştirme tamamlandı', { enriched, total: leads.length })
  } catch (error) {
    logger.warn('Otomatik Instagram zenginleştirme hatası', { error: String(error) })
  }
}

/**
 * 3 katmanlı Instagram profil bulma
 */
async function discoverInstagramProfile(
  lead: Lead,
  adapter: InstagramAdapter
): Promise<Partial<import('@/types/lead').RawLeadData> | null> {
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

/**
 * Lead'leri otomatik puanla (scraping sonrası)
 */
async function autoScoreLeads(
  supabase: ReturnType<typeof createServiceRoleClient>,
  leadIds: string[]
) {
  try {
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .in('id', leadIds)

    if (!leads || leads.length === 0) return

    for (const lead of leads as Lead[]) {
      const signals = buildAllSignals(lead)
      const result = calculateNeedScore(signals)

      // Temel skorlar (her zaman mevcut kolonlar)
      const baseUpdate = {
        need_score: result.totalScore,
        google_sub_score: result.googleSubScore,
        instagram_sub_score: result.instagramSubScore,
        recommendation: result.recommendation,
      }

      // Yeni kolonlar (migration sonrasi)
      const extendedUpdate = {
        ...baseUpdate,
        website_sub_score: result.websiteSubScore,
        marketing_sub_score: result.marketingSubScore,
      }

      // Once extended dene, basarisiz olursa base ile dene
      const { error } = await supabase.from('leads').update(extendedUpdate).eq('id', lead.id)
      if (error) {
        await supabase.from('leads').update(baseUpdate).eq('id', lead.id)
      }
    }

    logger.info('Otomatik puanlama tamamlandı', { count: leads.length })
  } catch (error) {
    logger.warn('Otomatik puanlama hatası', { error: String(error) })
  }
}
