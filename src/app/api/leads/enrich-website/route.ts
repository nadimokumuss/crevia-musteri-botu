import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { PageSpeedAdapter } from '@/infra/website/pagespeed.adapter'
import { logger } from '@/lib/logger'
import type { Lead } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const leadIds: string[] | undefined = body.lead_ids

    const supabase = createServiceRoleClient()
    const adapter = new PageSpeedAdapter()

    let query = supabase.from('leads').select('*')

    if (leadIds && leadIds.length > 0) {
      query = query.in('id', leadIds)
    } else {
      // Website'i olan ama analiz edilmemiş lead'ler
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

    let enriched = 0

    for (const lead of leads as Lead[]) {
      if (!lead.website) continue

      try {
        const result = await adapter.analyze(lead.website)

        const updateData: Record<string, unknown> = {
          website_speed_score: result.speedScore,
          website_is_mobile_friendly: result.isMobileFriendly,
          website_has_404s: result.has404s,
          website_has_meta_pixel: result.hasMetaPixel,
          website_has_ga4: result.hasGA4,
        }

        // Email bulunduysa ve lead'de email yoksa güncelle
        if (result.emails.length > 0 && !lead.email) {
          updateData.email = result.emails[0]
          updateData.email_source = 'website'
        }

        const { error: updateError } = await supabase
          .from('leads')
          .update(updateData)
          .eq('id', lead.id)

        if (updateError) {
          logger.warn('Website zenginleştirme güncelleme hatası', { leadId: lead.id, error: updateError.message })
        } else {
          enriched++
        }
      } catch (err) {
        logger.warn('Website zenginleştirme hatası', { leadId: lead.id, error: String(err) })
      }
    }

    logger.info('Website zenginleştirme tamamlandı', { enriched, total: leads.length })

    return NextResponse.json({ message: 'Website zenginleştirme tamamlandı', enriched, total: leads.length })
  } catch (error) {
    logger.error('Enrich-website API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
