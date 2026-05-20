import { NextRequest, NextResponse } from 'next/server'
import { startScrapeJobSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { createLeadSource } from '@/infra/scrapers/scraper-factory'
import { InstagramAdapter } from '@/infra/scrapers/instagram.adapter'
import {
  buildInstagramLeadUpdate,
  buildInstagramSeedUpdateFromWebsite,
  discoverOrBackfillInstagramProfileForLead,
  needsInstagramProfileBackfill,
} from '@/infra/instagram/discovery'
import { calculateNeedScore } from '@/core/scoring/need-score'
import { logger } from '@/lib/logger'
import { buildAllSignals } from '@/lib/signal-builders'
import type { ScrapeJobStatus, Lead } from '@/types/database'
import type { RawLeadData } from '@/types/lead'

// Vercel Hobby plan: max 60 saniye
export const maxDuration = 60

const IG_ENRICHMENT_CONCURRENCY = 5

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = startScrapeJobSchema.parse(body)
    const weeklyPlanId = body.weekly_plan_id as string | undefined
    const skipInstagram = body.skip_instagram !== false  // default: skip (Faz 3.2)

    const supabase = createServiceRoleClient()

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
      .maybeSingle()

    if (insertError || !job) {
      logger.error('Scrape job oluşturulamadı', { error: insertError?.message })
      return NextResponse.json({ error: 'Scrape job oluşturulamadı' }, { status: 500 })
    }

    const result = await runScrapeJob(
      job.id,
      parsed.district_id,
      parsed.source_adapter,
      parsed.category,
      skipInstagram,
      parsed.limit
    )

    if (result.status === 'FAILED') {
      return NextResponse.json(
        {
          jobId: job.id,
          status: result.status,
          error: result.errorMessage,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        jobId: job.id,
        status: result.status,
        leadsFound: result.leadsFound,
        leadsNew: result.leadsNew,
        leadsUpdated: result.leadsUpdated,
      },
      { status: 201 }
    )
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
        .maybeSingle()

      if (error) {
        logger.error('Job sorgusu hatasi', { error: error.message })
        return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })
      }
      if (!data) {
        return NextResponse.json({ error: 'Job bulunamadı' }, { status: 404 })
      }

      return NextResponse.json(data)
    }

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
  skipInstagram = true,
  limit?: number,
) {
  const supabase = createServiceRoleClient()

  await supabase
    .from('scrape_jobs')
    .update({ status: 'RUNNING' as ScrapeJobStatus, started_at: new Date().toISOString() })
    .eq('id', jobId)

  try {
    const { data: district } = await supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .maybeSingle()

    const adapter = createLeadSource(sourceAdapter as 'google-places' | 'apify' | 'instagram')
    const result = await adapter.search({ districtId, districtName: district?.name, category, limit })

    const { leadsNew, leadsUpdated, affectedLeadIds } = await batchUpsertLeads(
      supabase,
      result.leads,
      districtId,
      category
    )

    if (affectedLeadIds.length > 0) {
      if (!skipInstagram) {
        await autoEnrichInstagramParallel(supabase, affectedLeadIds)
      }
      await autoScoreLeads(supabase, affectedLeadIds)
    }

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
    return {
      status: 'COMPLETED' as const,
      leadsFound: result.totalFound,
      leadsNew,
      leadsUpdated,
      errorMessage: null,
    }
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
    return {
      status: 'FAILED' as const,
      leadsFound: 0,
      leadsNew: 0,
      leadsUpdated: 0,
      errorMessage: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }
  }
}

/**
 * 3 grupta toplu upsert (N+1 yerine 4-5 query)
 *  - googlePlaceId olanlar → upsert(onConflict: 'google_place_id')
 *  - sadece igUsername olanlar → mevcutları topluca SELECT + bulk update / bulk insert
 *  - ne google ne IG → düz toplu insert
 */
async function batchUpsertLeads(
  supabase: ReturnType<typeof createServiceRoleClient>,
  leads: RawLeadData[],
  districtId: string,
  defaultCategory?: string
): Promise<{ leadsNew: number; leadsUpdated: number; affectedLeadIds: string[] }> {
  const googleLeads = leads.filter((l) => !!l.googlePlaceId)
  const igOnlyLeads = leads.filter((l) => !l.googlePlaceId && !!l.igUsername)
  const otherLeads = leads.filter((l) => !l.googlePlaceId && !l.igUsername)

  let leadsNew = 0
  let leadsUpdated = 0
  const affectedLeadIds: string[] = []

  // 1) Google: tek upsert
  if (googleLeads.length > 0) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id, google_place_id, ig_username')
      .in('google_place_id', googleLeads.map((l) => l.googlePlaceId!))

    const existingMap = new Map(
      (existing ?? []).map((row) => [row.google_place_id as string, row])
    )

    const upsertRows = googleLeads.map((lead) => {
      const existingRow = existingMap.get(lead.googlePlaceId!)
      const seed = buildInstagramSeedUpdateFromWebsite(lead.website)
      const includeSeed = seed && (!existingRow?.ig_username || existingRow.ig_username === '')

      return {
        ...(existingRow ? { id: existingRow.id } : {}),
        district_id: districtId,
        business_name: lead.businessName,
        category: lead.category ?? defaultCategory,
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
        ...(includeSeed ? seed : {}),
      }
    })

    const { data: upserted, error } = await supabase
      .from('leads')
      .upsert(upsertRows, { onConflict: 'google_place_id' })
      .select('id, google_place_id')

    if (error) {
      logger.error('Google leads upsert hatası', { error: error.message })
      throw new Error('Lead toplu upsert basarisiz')
    }

    for (const row of upserted ?? []) {
      affectedLeadIds.push(row.id as string)
      if (existingMap.has(row.google_place_id as string)) {
        leadsUpdated++
      } else {
        leadsNew++
      }
    }
  }

  // 2) IG-only: bulk SELECT, sonra bulk update vs bulk insert (UNIQUE constraint olmadığı için manuel split)
  if (igOnlyLeads.length > 0) {
    const usernames = igOnlyLeads.map((l) => l.igUsername!)
    const { data: existing } = await supabase
      .from('leads')
      .select('id, ig_username')
      .in('ig_username', usernames)

    const existingMap = new Map((existing ?? []).map((row) => [row.ig_username as string, row.id as string]))

    const updates: Array<{ id: string; row: Record<string, unknown> }> = []
    const inserts: Array<Record<string, unknown>> = []

    for (const lead of igOnlyLeads) {
      const igPayload = {
        ig_follower_count: lead.igFollowerCount,
        ig_post_count: lead.igPostCount,
        ig_avg_likes: lead.igAvgLikes,
        ig_last_post_date: lead.igLastPostDate,
        ig_has_highlights: lead.igHasHighlights,
        ig_bio_contains_agency: lead.igBioContainsAgency,
        ig_has_bio_link: lead.igHasBioLink,
        ig_engagement_rate: lead.igEngagementRate,
        ig_posting_regularity: lead.igPostingRegularity,
      }

      const existingId = existingMap.get(lead.igUsername!)
      if (existingId) {
        updates.push({ id: existingId, row: igPayload })
        affectedLeadIds.push(existingId)
        leadsUpdated++
      } else {
        inserts.push({
          district_id: districtId,
          business_name: lead.businessName,
          ig_username: lead.igUsername,
          ...igPayload,
        })
      }
    }

    // Bulk update — Supabase tek sorguda farklı satıra farklı değer atayamaz; paralel UPDATE
    await Promise.all(
      updates.map(({ id, row }) => supabase.from('leads').update(row).eq('id', id))
    )

    if (inserts.length > 0) {
      const { data: inserted, error } = await supabase
        .from('leads')
        .insert(inserts)
        .select('id')

      if (error) {
        logger.warn('IG-only insert hatası', { error: error.message })
      } else {
        for (const row of inserted ?? []) {
          affectedLeadIds.push(row.id as string)
          leadsNew++
        }
      }
    }
  }

  // 3) Diğer (ne google ne ig) → düz toplu insert
  if (otherLeads.length > 0) {
    const inserts = otherLeads.map((lead) => {
      const seed = buildInstagramSeedUpdateFromWebsite(lead.website)
      return {
        district_id: districtId,
        business_name: lead.businessName,
        category: lead.category ?? defaultCategory,
        address: lead.address,
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        lat: lead.lat,
        lng: lead.lng,
        ...(seed ?? {}),
      }
    })

    const { data: inserted, error } = await supabase
      .from('leads')
      .insert(inserts)
      .select('id')

    if (error) {
      logger.warn('Diğer leads insert hatası', { error: error.message })
    } else {
      for (const row of inserted ?? []) {
        affectedLeadIds.push(row.id as string)
        leadsNew++
      }
    }
  }

  return { leadsNew, leadsUpdated, affectedLeadIds }
}

/**
 * Paralel IG enrichment — concurrency limit ile
 */
async function autoEnrichInstagramParallel(
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

    if (!leads || leads.length === 0) return

    const queue = (leads as Lead[]).filter((lead) =>
      !lead.ig_username || needsInstagramProfileBackfill(lead)
    )

    let enriched = 0

    // Concurrency-limited paralel işleyici
    const workers = Array.from({ length: Math.min(IG_ENRICHMENT_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const lead = queue.shift()
        if (!lead) break
        try {
          const discovery = await discoverOrBackfillInstagramProfileForLead(lead, adapter)
          if (!discovery) continue
          await supabase
            .from('leads')
            .update(buildInstagramLeadUpdate(discovery))
            .eq('id', lead.id)
          enriched++
        } catch (err) {
          logger.warn('Otomatik IG zenginleştirme hatası', {
            leadId: lead.id,
            error: String(err),
          })
        }
      }
    })

    await Promise.all(workers)

    logger.info('Otomatik Instagram zenginleştirme tamamlandı', { enriched, total: leads.length })
  } catch (error) {
    logger.warn('Otomatik Instagram zenginleştirme hatası', { error: String(error) })
  }
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

    await Promise.all(
      (leads as Lead[]).map(async (lead) => {
        const signals = buildAllSignals(lead)
        const result = calculateNeedScore(signals)

        const update = {
          need_score: result.totalScore,
          google_sub_score: result.googleSubScore,
          instagram_sub_score: result.instagramSubScore,
          website_sub_score: result.websiteSubScore,
          marketing_sub_score: result.marketingSubScore,
          recommendation: result.recommendation,
        }

        const { error } = await supabase.from('leads').update(update).eq('id', lead.id)
        if (error) {
          logger.warn('Otomatik puanlama lead başarısız', { leadId: lead.id, error: error.message })
        }
      })
    )

    logger.info('Otomatik puanlama tamamlandı', { count: leads.length })
  } catch (error) {
    logger.warn('Otomatik puanlama hatası', { error: String(error) })
  }
}
