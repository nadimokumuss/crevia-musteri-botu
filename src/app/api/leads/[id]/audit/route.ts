import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { OutscraperReviewsAdapter, type ReviewsSummary } from '@/infra/outscraper/reviews.adapter'
import { synthesizeAudit } from '@/core/audit/llm-synthesis'
import { persistAudit } from '@/core/audit/audit-pipeline'
import { logger } from '@/lib/logger'
import { auditSingleSchema } from '@/lib/validators'
import type { Lead } from '@/types/database'

export const maxDuration = 120

const GBP_REVIEW_CACHE_DAYS = 30

function isCacheStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true
  const fetched = new Date(fetchedAt).getTime()
  if (!Number.isFinite(fetched)) return true
  return Date.now() - fetched > GBP_REVIEW_CACHE_DAYS * 24 * 60 * 60 * 1000
}

/**
 * POST /api/leads/[id]/audit — admin-only tek-lead audit tetik.
 * GBP review cache stale ise enrich, sonra LLM ile synth, sonra DB'ye yaz.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params

    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erisim' }, { status: 401 })
    }

    const serviceClient = createServiceRoleClient()
    const { data: callerAgent } = await serviceClient
      .from('agents')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!callerAgent || !callerAgent.is_active || callerAgent.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Bu islem icin yonetici yetkisi gerekli' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = auditSingleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Gecersiz istek govdesi' }, { status: 400 })
    }
    const forceRegenerate = parsed.data.forceRegenerate ?? false

    const { data: lead, error: fetchError } = await serviceClient
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle<Lead>()

    if (fetchError) {
      logger.error('Tek-lead audit lead fetch hatasi', {
        leadId,
        error: fetchError.message,
      })
      return NextResponse.json({ error: 'Lead sorgulanamadi' }, { status: 500 })
    }
    if (!lead) {
      return NextResponse.json({ error: 'Lead bulunamadi' }, { status: 404 })
    }
    if (lead.audit_generated_at && !forceRegenerate) {
      return NextResponse.json(
        {
          error: 'Bu lead icin audit zaten var; yeniden uretmek icin forceRegenerate=true gonderin.',
          slug: lead.audit_share_slug,
        },
        { status: 409 }
      )
    }

    // Stage 2 — GBP review enrichment (cache miss ise)
    let reviewsSummary: ReviewsSummary | null = null
    if (lead.google_place_id && isCacheStale(lead.gbp_reviews_fetched_at)) {
      try {
        const adapter = new OutscraperReviewsAdapter()
        const summary = await adapter.fetchReviewsSummary(lead.google_place_id)
        if (summary) {
          await serviceClient
            .from('leads')
            .update({
              gbp_reviews_summary: summary as unknown as Record<string, unknown>,
              gbp_reviews_fetched_at: new Date().toISOString(),
            })
            .eq('id', lead.id)
          reviewsSummary = summary
        }
      } catch (error) {
        logger.warn('Tek-lead audit GBP enrich hatasi', {
          leadId,
          error: error instanceof Error ? error.message : String(error),
        })
        // Fail-soft: GBP yoksa LLM yine de calisir
      }
    } else if (lead.gbp_reviews_summary) {
      reviewsSummary = lead.gbp_reviews_summary as unknown as ReviewsSummary
    }

    // Stage 3 — LLM + persist
    const synthesis = await synthesizeAudit({ lead, reviewsSummary })
    const { slug } = await persistAudit(serviceClient, lead, synthesis, forceRegenerate)

    logger.info('Tek-lead audit uretildi', {
      leadId,
      tier: synthesis.tier,
      costUsd: synthesis.actualCostUsd,
    })

    return NextResponse.json({
      slug,
      tier: synthesis.tier,
      costUsd: synthesis.actualCostUsd,
      model: synthesis.modelId,
    })
  } catch (error) {
    logger.error('Tek-lead audit API hatasi', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatasi' }, { status: 500 })
  }
}
