import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { InstagramAdapter } from '@/infra/scrapers/instagram.adapter'
import { runInstagramEnrichment } from '@/infra/instagram/enrichment'
import {
  countPendingInstagramLeads,
} from '@/infra/instagram/pending-leads'
import { logger } from '@/lib/logger'
import { enrichInstagramBatchSchema } from '@/lib/validators'

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
    const body = await request.json().catch(() => ({}))
    const parsed = enrichInstagramBatchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
    }

    const districtId = parsed.data.district_id
    const batchLimit = parsed.data.limit

    const supabase = createServiceRoleClient()
    const pendingCount = await countPendingInstagramLeads(supabase, districtId, {
      includeBackfill: false,
      includeRetries: false,
    })

    if (pendingCount === 0) {
      return NextResponse.json({
        message: 'Instagram kesfi bekleyen kayit bulunamadi',
        enriched: 0,
        processed: 0,
        backfilled: 0,
        unmatched: 0,
        remaining: 0,
        completedAll: true,
        sources: {
          website_url: 0,
          website_html: 0,
          candidate_verified: 0,
        },
        matches: [],
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

    const result = await runInstagramEnrichment(supabase, adapter, {
      districtId,
      batchSize: 25,
      maxLeads: batchLimit ? Math.min(batchLimit, 500) : undefined,
      timeBudgetMs: 270_000,
      includeBackfill: false,
      includeRetries: false,
    })

    logger.info('Instagram zenginleştirme tamamlandı', {
      enriched: result.enriched,
      processed: result.processed,
      remaining: result.remaining,
      completedAll: result.completedAll,
    })

    return NextResponse.json({
      message: result.completedAll
        ? 'Instagram kesif kuyrugu tamamlandi'
        : 'Sure doldu, kalan kayitlar cron ile devam edecek',
      ...result,
    })
  } catch (error) {
    logger.error('Instagram enrich API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
