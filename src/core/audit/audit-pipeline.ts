/**
 * Audit pipeline — 3-katmanli huni
 *
 * Stage 1 — Heuristic filter: need_score >= minScore + audit_generated_at IS NULL
 * Stage 2 — GBP review enrichment (Outscraper, 30 gun cache)
 * Stage 3 — LLM synthesis (Sonnet 4.6) — Faz 1 PR2'de aktif
 *
 * - Worker pool ile concurrent (CONCURRENCY=3)
 * - Per-batch USD butce guard
 * - Per-lead fail-soft (bir lead'in hatasi diger lead'leri etkilemez)
 */

import { nanoid } from 'nanoid'
import { OutscraperReviewsAdapter, type ReviewsSummary } from '@/infra/outscraper/reviews.adapter'
import { synthesizeAudit, type AuditSynthesisResult } from '@/core/audit/llm-synthesis'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import type { Lead } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditPipelineOptions {
  /** Minimum need_score esigi. Default 40 (MEDIUM ve uzeri) */
  minScore?: number
  /** Bir batch'te en fazla islenecek lead sayisi. Default 25 */
  limit?: number
  /** Mevcut audit varsa bile yeniden uret. Default false */
  forceRegenerate?: boolean
  /** Faz 3 multi-tenant — su an kullanilmaz */
  tenantId?: string
  /** Bir batch icin maksimum dolar butcesi. Default env MAX_DAILY_AUDIT_BUDGET_USD veya 20 */
  budgetUsd?: number
}

export interface AuditPipelineError {
  leadId: string
  stage: 'enrich' | 'synthesis' | 'persist'
  message: string
}

export interface AuditPipelineResult {
  eligible: number
  enriched: number
  synthesized: number
  skipped: number
  errors: AuditPipelineError[]
  estimatedCostUsd: { gbp: number; llm: number; total: number }
}

const PIPELINE_CONCURRENCY = 3
const GBP_REVIEW_CACHE_DAYS = 30
const OUTSCRAPER_COST_PER_LEAD_USD = 0.06 // 20 reviews x ~$0.003
const LLM_COST_PER_LEAD_USD_ESTIMATE = 0.15 // Sonnet 4.6 audit + script + email

const SLUG_COLLISION_RETRIES = 3

function defaultBudgetUsd(): number {
  const raw = process.env.MAX_DAILY_AUDIT_BUDGET_USD
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20
}

function isCacheStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true
  const fetched = new Date(fetchedAt).getTime()
  if (!Number.isFinite(fetched)) return true
  const ageMs = Date.now() - fetched
  return ageMs > GBP_REVIEW_CACHE_DAYS * 24 * 60 * 60 * 1000
}

export async function runAuditPipeline(
  options: AuditPipelineOptions = {}
): Promise<AuditPipelineResult> {
  const minScore = options.minScore ?? 40
  const limit = options.limit ?? 25
  const forceRegenerate = options.forceRegenerate ?? false
  const budgetUsd = options.budgetUsd ?? defaultBudgetUsd()

  const supabase = createServiceRoleClient()
  const reviewsAdapter = new OutscraperReviewsAdapter()

  // Stage 1 — Heuristic filter
  let query = supabase
    .from('leads')
    .select('*')
    .gte('need_score', minScore)
    .order('need_score', { ascending: false })
    .limit(limit)

  if (!forceRegenerate) {
    query = query.is('audit_generated_at', null)
  }

  const { data: leads, error } = await query

  if (error) {
    logger.error('Audit pipeline lead sorgu hatasi', { error: error.message })
    throw new Error(`Lead sorgu hatasi: ${error.message}`)
  }

  const eligibleLeads = (leads ?? []) as Lead[]
  const result: AuditPipelineResult = {
    eligible: eligibleLeads.length,
    enriched: 0,
    synthesized: 0,
    skipped: 0,
    errors: [],
    estimatedCostUsd: { gbp: 0, llm: 0, total: 0 },
  }

  if (eligibleLeads.length === 0) {
    logger.info('Audit pipeline: islenecek lead yok', { minScore, limit })
    return result
  }

  // Butce guard — kaba on-tahmin (en kotu durum: tum lead'lere review fetch + LLM)
  const perLeadCostEstimate =
    OUTSCRAPER_COST_PER_LEAD_USD + LLM_COST_PER_LEAD_USD_ESTIMATE
  const estimatedTotalCost = eligibleLeads.length * perLeadCostEstimate

  let workQueue = eligibleLeads
  if (estimatedTotalCost > budgetUsd) {
    const safeBatch = Math.max(0, Math.floor(budgetUsd / perLeadCostEstimate))
    logger.warn('Audit pipeline batch butceyi asiyor; kirpildi', {
      eligible: eligibleLeads.length,
      budgetUsd,
      safeBatch,
    })
    workQueue = eligibleLeads.slice(0, safeBatch)
    result.eligible = workQueue.length
  }

  // Stage 2 + 3 — Worker pool
  const queue = [...workQueue]

  const workers = Array.from(
    { length: Math.min(PIPELINE_CONCURRENCY, queue.length) },
    async () => {
      while (queue.length > 0) {
        const lead = queue.shift()
        if (!lead) break

        let reviewsSummary: ReviewsSummary | null = null

        // Stage 2 — GBP enrichment
        try {
          const needsReviewFetch =
            !!lead.google_place_id && isCacheStale(lead.gbp_reviews_fetched_at)

          if (needsReviewFetch && lead.google_place_id) {
            const summary = await reviewsAdapter.fetchReviewsSummary(lead.google_place_id)
            if (summary) {
              await persistReviewsSummary(supabase, lead.id, summary)
              result.enriched++
              result.estimatedCostUsd.gbp += OUTSCRAPER_COST_PER_LEAD_USD
              reviewsSummary = summary
            }
          } else if (lead.gbp_reviews_summary) {
            // Cache taze — DB'deki summary'yi kullan
            reviewsSummary = lead.gbp_reviews_summary as unknown as ReviewsSummary
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.warn('Audit pipeline GBP enrich hatasi', { leadId: lead.id, error: message })
          result.errors.push({ leadId: lead.id, stage: 'enrich', message })
          // GBP basarisiz olsa bile LLM denenecek — sadece review data olmadan
        }

        // Stage 3 — LLM synthesis + persist
        try {
          const synthesis = await synthesizeAudit({ lead, reviewsSummary })
          await persistAudit(supabase, lead, synthesis, forceRegenerate)
          result.synthesized++
          result.estimatedCostUsd.llm += synthesis.actualCostUsd
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.warn('Audit pipeline synthesis/persist hatasi', { leadId: lead.id, error: message })
          result.errors.push({
            leadId: lead.id,
            stage: error instanceof PersistError ? 'persist' : 'synthesis',
            message,
          })
          result.skipped++
        }
      }
    }
  )

  await Promise.all(workers)

  result.estimatedCostUsd.total =
    result.estimatedCostUsd.gbp + result.estimatedCostUsd.llm

  logger.info('Audit pipeline tamamlandi', {
    eligible: result.eligible,
    enriched: result.enriched,
    synthesized: result.synthesized,
    skipped: result.skipped,
    errors: result.errors.length,
    estimatedCostUsd: result.estimatedCostUsd.total,
  })

  return result
}

async function persistReviewsSummary(
  supabase: SupabaseClient,
  leadId: string,
  summary: ReviewsSummary
): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({
      gbp_reviews_summary: summary as unknown as Record<string, unknown>,
      gbp_reviews_fetched_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) {
    throw new Error(`Lead update failed: ${error.message}`)
  }
}

class PersistError extends Error {}

/**
 * Audit verisi + slug'i yaz. Mevcut slug korunur (paylasilmis linkler kirilmaz).
 * Slug yoksa business_name + nanoid(6) ile uretilir; collision durumunda yeniden denenir.
 */
export async function persistAudit(
  supabase: SupabaseClient,
  lead: Lead,
  synthesis: AuditSynthesisResult,
  forceRegenerate: boolean
): Promise<{ slug: string }> {
  const existingSlug = lead.audit_share_slug
  let slug = existingSlug

  if (!slug || (forceRegenerate && !existingSlug)) {
    slug = await generateUniqueSlug(supabase, lead.business_name)
  }

  const update: Record<string, unknown> = {
    audit_narrative: synthesis.narrative,
    audit_strengths: synthesis.strengths,
    audit_gaps: synthesis.gaps,
    audit_tier: synthesis.tier,
    phone_script: synthesis.phone_script,
    outreach_email_subject: synthesis.outreach_email_subject,
    outreach_email_body: synthesis.outreach_email_body,
    audit_share_slug: slug,
    audit_generated_at: new Date().toISOString(),
    audit_model: synthesis.modelId,
  }

  const { error } = await supabase.from('leads').update(update).eq('id', lead.id)

  if (error) {
    throw new PersistError(`Audit persist hatasi: ${error.message}`)
  }

  return { slug: slug! }
}

const SLUG_REPLACEMENTS: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  I: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
}

function slugifyBusinessName(name: string): string {
  const transliterated = name
    .split('')
    .map((c) => SLUG_REPLACEMENTS[c] ?? c)
    .join('')

  const slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return slug || 'isletme'
}

async function generateUniqueSlug(
  supabase: SupabaseClient,
  businessName: string
): Promise<string> {
  const base = slugifyBusinessName(businessName)

  for (let attempt = 0; attempt < SLUG_COLLISION_RETRIES; attempt++) {
    const candidate = `${base}-${nanoid(6)}`
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .eq('audit_share_slug', candidate)
      .maybeSingle()

    if (error) {
      throw new PersistError(`Slug collision check hatasi: ${error.message}`)
    }
    if (!data) {
      return candidate
    }
  }

  throw new PersistError(`Slug uretilemedi: ${SLUG_COLLISION_RETRIES} denemede collision`)
}

// Test/diagnostic icin export
export const __test = { slugifyBusinessName, generateUniqueSlug }
