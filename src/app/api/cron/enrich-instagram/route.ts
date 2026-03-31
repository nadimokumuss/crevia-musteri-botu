import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { InstagramAdapter } from '@/infra/scrapers/instagram.adapter'
import { runInstagramEnrichment } from '@/infra/instagram/enrichment'
import {
  countPendingInstagramLeads,
} from '@/infra/instagram/pending-leads'
import { logger } from '@/lib/logger'

/**
 * Cron job: Her dakika 1 lead zenginleştir
 * Vercel Hobby plan 10 saniye limit - tek lead güvenli
 */
export const maxDuration = 300

export async function GET(request: NextRequest) {
  // Cron secret kontrolü (opsiyonel güvenlik)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()
    const pendingCount = await countPendingInstagramLeads(supabase, undefined, {
      includeBackfill: true,
      includeRetries: true,
    })

    if (pendingCount === 0) {
      return NextResponse.json({ message: 'İşlenecek Instagram kaydı yok', enriched: 0 })
    }

    const adapter = new InstagramAdapter()
    const isAvailable = await adapter.isAvailable()

    if (!isAvailable) {
      return NextResponse.json({ error: 'Apify not configured' }, { status: 503 })
    }

    const result = await runInstagramEnrichment(supabase, adapter, {
      batchSize: 25,
      timeBudgetMs: 250_000,
      includeBackfill: true,
      includeRetries: true,
      websiteFetchTimeoutMs: 3000,
    })

    logger.info('Cron: Instagram zenginleştirme', {
      enriched: result.enriched,
      backfilled: result.backfilled,
      processed: result.processed,
      remaining: result.remaining,
      completedAll: result.completedAll,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Cron: Genel hata', { error: String(error) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
