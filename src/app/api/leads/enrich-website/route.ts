import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { PageSpeedAdapter } from '@/infra/website/pagespeed.adapter'
import { calculateNeedScore } from '@/core/scoring/need-score'
import { buildAllSignals } from '@/lib/signal-builders'
import { logger } from '@/lib/logger'
import { optionalLeadIdsSchema } from '@/lib/validators'
import type { Lead } from '@/types/database'

const WEBSITE_ENRICHMENT_CONCURRENCY = 3

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = optionalLeadIdsSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
    }

    const leadIds = parsed.data.lead_ids

    const supabase = createServiceRoleClient()
    const adapter = new PageSpeedAdapter()

    let query = supabase.from('leads').select('*')

    if (leadIds && leadIds.length > 0) {
      query = query.in('id', leadIds)
    } else {
      query = query
        .not('website', 'is', null)
        .is('website_speed_score', null)
        .limit(20)
    }

    const { data: leads, error } = await query

    if (error) {
      logger.error('Lead\'ler getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'Zenginleştirilecek lead bulunamadı', enriched: 0 })
    }

    const queue = (leads as Lead[]).filter((lead) => !!lead.website)
    let enriched = 0

    const workers = Array.from(
      { length: Math.min(WEBSITE_ENRICHMENT_CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const lead = queue.shift()
          if (!lead || !lead.website) break

          try {
            const result = await adapter.analyze(lead.website)

            const update: Record<string, unknown> = {
              website_speed_score: result.speedScore,
              website_is_mobile_friendly: result.isMobileFriendly,
              website_has_404s: result.has404s,
              website_has_meta_pixel: result.hasMetaPixel,
              website_has_ga4: result.hasGA4,
            }

            if (result.emails.length > 0 && !lead.email) {
              update.email = result.emails[0]
              update.email_source = 'website'
            }

            // Tek UPDATE: enrichment + rescore birleşik
            const rescoredLead = {
              ...lead,
              ...update,
              email: (update.email as string | undefined) ?? lead.email,
              email_source: (update.email_source as Lead['email_source'] | undefined) ?? lead.email_source,
            } as Lead

            const score = calculateNeedScore(buildAllSignals(rescoredLead))

            update.need_score = score.totalScore
            update.google_sub_score = score.googleSubScore
            update.instagram_sub_score = score.instagramSubScore
            update.website_sub_score = score.websiteSubScore
            update.marketing_sub_score = score.marketingSubScore
            update.recommendation = score.recommendation

            const { error: updateError } = await supabase
              .from('leads')
              .update(update)
              .eq('id', lead.id)

            if (updateError) {
              logger.warn('Website zenginleştirme güncelleme hatası', {
                leadId: lead.id,
                error: updateError.message,
              })
            } else {
              enriched++
            }
          } catch (err) {
            logger.warn('Website zenginleştirme hatası', { leadId: lead.id, error: String(err) })
          }
        }
      }
    )

    await Promise.all(workers)

    logger.info('Website zenginleştirme tamamlandı', { enriched, total: leads.length })

    return NextResponse.json({ message: 'Website zenginleştirme tamamlandı', enriched, total: leads.length })
  } catch (error) {
    logger.error('Enrich-website API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
