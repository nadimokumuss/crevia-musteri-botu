import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logLeadActivity } from '@/infra/supabase/log-activity'
import { calculateNeedScore } from '@/core/scoring/need-score'
import { logger } from '@/lib/logger'
import { buildAllSignals } from '@/lib/signal-builders'
import { optionalLeadIdsSchema } from '@/lib/validators'
import type { Lead } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = optionalLeadIdsSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
    }

    const leadIds = parsed.data.lead_ids

    const supabase = createServiceRoleClient()

    let query = supabase.from('leads').select('*')

    if (leadIds && leadIds.length > 0) {
      query = query.in('id', leadIds)
    } else {
      // Puanlanmamış veya yeniden puanlanması gereken lead'ler
      query = query.eq('need_score', 0).limit(100)
    }

    const { data: leads, error } = await query

    if (error) {
      logger.error('Lead\'ler getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'Puanlanacak lead bulunamadı', scored: 0 })
    }

    let scored = 0

    for (const lead of leads as Lead[]) {
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

      const { error: updateError } = await supabase
        .from('leads')
        .update(update)
        .eq('id', lead.id)

      if (updateError) {
        logger.warn('Lead puanı güncellenemedi', { leadId: lead.id, error: updateError.message })
        continue
      }

      scored++
      await logLeadActivity({
        leadId: lead.id,
        activityType: 'SCORE_CALCULATED',
        description: `Puan hesaplandı: ${result.totalScore}/100 (${result.recommendation})`,
        oldValue: lead.need_score?.toString() ?? '0',
        newValue: result.totalScore.toString(),
        metadata: { recommendation: result.recommendation },
      })
    }

    logger.info('Toplu puanlama tamamlandı', { scored, total: leads.length })

    return NextResponse.json({ message: 'Puanlama tamamlandı', scored, total: leads.length })
  } catch (error) {
    logger.error('Score API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
