import { calculateNeedScore } from '@/core/scoring/need-score'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { buildGoogleSignals, buildMarketingSignals, buildWebsiteSignals } from '@/lib/signal-builders'
import type { Lead } from '@/types/database'
import type { InstagramSignals } from '@/types/scoring'
import { buildInstagramLeadUpdate, discoverOrBackfillInstagramProfileForLead, needsInstagramProfileBackfill } from './discovery'
import { countPendingInstagramLeads, loadPendingInstagramLeads } from './pending-leads'
import { updateLeadWithInstagramSchemaFallback } from './schema-fallback'
import { InstagramAdapter } from '../scrapers/instagram.adapter'

type SupabaseClient = ReturnType<typeof createServiceRoleClient>

export interface EnrichedInstagramMatch {
  id: string
  businessName: string
  username: string
  source: 'WEBSITE_URL' | 'WEBSITE_HTML' | 'CANDIDATE_VERIFIED'
}

export interface InstagramEnrichmentSummary {
  processed: number
  enriched: number
  backfilled: number
  unmatched: number
  remaining: number
  completedAll: boolean
  sources: {
    website_url: number
    website_html: number
    candidate_verified: number
  }
  matches: EnrichedInstagramMatch[]
}

interface InstagramEnrichmentOptions {
  districtId?: string
  batchSize?: number
  maxLeads?: number
  timeBudgetMs?: number
  includeBackfill?: boolean
  websiteFetchTimeoutMs?: number
}

export async function runInstagramEnrichment(
  supabase: SupabaseClient,
  adapter: InstagramAdapter,
  options: InstagramEnrichmentOptions = {}
): Promise<InstagramEnrichmentSummary> {
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 25, 100))
  const maxLeads = options.maxLeads ?? Number.POSITIVE_INFINITY
  const deadline = Date.now() + (options.timeBudgetMs ?? 270_000)
  const includeBackfill = options.includeBackfill !== false

  let processed = 0
  let enriched = 0
  let backfilled = 0
  let unmatched = 0
  const matches: EnrichedInstagramMatch[] = []
  const sources = {
    website_url: 0,
    website_html: 0,
    candidate_verified: 0,
  }

  while (processed < maxLeads && Date.now() < deadline) {
    const remainingSlots = Number.isFinite(maxLeads)
      ? Math.max(0, Math.min(batchSize, maxLeads - processed))
      : batchSize

    if (remainingSlots === 0) {
      break
    }

    const { leads, error } = await loadPendingInstagramLeads(
      supabase,
      options.districtId,
      remainingSlots,
      { includeBackfill }
    )

    if (error) {
      throw new Error(error.message)
    }

    if (!leads || leads.length === 0) {
      break
    }

    for (const lead of leads) {
      if (processed >= maxLeads || Date.now() >= deadline) {
        break
      }

      const hadUsername = Boolean(lead.ig_username)
      const wasBackfillLead = needsInstagramProfileBackfill(lead)
      const discovery = await discoverOrBackfillInstagramProfileForLead(lead, adapter, {
        websiteFetchTimeoutMs: options.websiteFetchTimeoutMs,
      })

      processed++

      if (!discovery?.username) {
        if (!hadUsername) {
          await updateLeadWithInstagramSchemaFallback(supabase, lead.id, {
            ig_username: '',
            ig_discovery_source: null,
          })

          unmatched++
        }
        continue
      }

      const instagramUpdate = buildInstagramLeadUpdate(discovery)
      await updateLeadWithInstagramSchemaFallback(supabase, lead.id, instagramUpdate)

      const scoredLead = applyInstagramUpdateToLead(lead, instagramUpdate)
      const google = buildGoogleSignals(scoredLead)
      const instagram = buildInstagramSignalsFromLead(scoredLead)
      const website = buildWebsiteSignals(scoredLead)
      const marketing = buildMarketingSignals(scoredLead)
      const score = calculateNeedScore({ google, instagram, website, marketing })

      const { error: scoreUpdateError } = await supabase
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

      if (scoreUpdateError) {
        throw new Error(scoreUpdateError.message)
      }

      if (!hadUsername) {
        enriched++
        matches.push({
          id: lead.id,
          businessName: lead.business_name,
          username: discovery.username,
          source: discovery.source,
        })

        if (discovery.source === 'WEBSITE_URL') {
          sources.website_url++
        } else if (discovery.source === 'WEBSITE_HTML') {
          sources.website_html++
        } else {
          sources.candidate_verified++
        }
      } else if (wasBackfillLead) {
        backfilled++
      }
    }

    if (leads.length < remainingSlots) {
      break
    }
  }

  const remaining = await countPendingInstagramLeads(supabase, options.districtId, { includeBackfill })

  return {
    processed,
    enriched,
    backfilled,
    unmatched,
    remaining,
    completedAll: remaining === 0,
    sources,
    matches,
  }
}

function buildInstagramSignalsFromLead(lead: Lead): InstagramSignals | null {
  if (!lead.ig_username) {
    return null
  }

  return {
    exists: true,
    lastPostDate: lead.ig_last_post_date ? new Date(lead.ig_last_post_date) : null,
    avgLikes: lead.ig_avg_likes,
    postCount: lead.ig_post_count,
    hasHighlights: lead.ig_has_highlights,
    bioContainsAgency: lead.ig_bio_contains_agency,
    hasBioLink: lead.ig_has_bio_link,
    followerCount: lead.ig_follower_count,
    postingRegularity: lead.ig_posting_regularity,
    engagementRate: lead.ig_engagement_rate,
    reelsRatio: lead.ig_reels_ratio,
  }
}

function applyInstagramUpdateToLead(
  lead: Lead,
  instagramUpdate: ReturnType<typeof buildInstagramLeadUpdate>
): Lead {
  return {
    ...lead,
    ig_username: instagramUpdate.ig_username ?? lead.ig_username,
    ig_discovery_source: instagramUpdate.ig_discovery_source ?? lead.ig_discovery_source,
    ig_follower_count: instagramUpdate.ig_follower_count ?? lead.ig_follower_count,
    ig_post_count: instagramUpdate.ig_post_count ?? lead.ig_post_count,
    ig_avg_likes: instagramUpdate.ig_avg_likes ?? lead.ig_avg_likes,
    ig_last_post_date: instagramUpdate.ig_last_post_date ?? lead.ig_last_post_date,
    ig_has_highlights: instagramUpdate.ig_has_highlights ?? lead.ig_has_highlights,
    ig_bio_contains_agency: instagramUpdate.ig_bio_contains_agency ?? lead.ig_bio_contains_agency,
    ig_has_bio_link: instagramUpdate.ig_has_bio_link ?? lead.ig_has_bio_link,
    ig_engagement_rate: instagramUpdate.ig_engagement_rate ?? lead.ig_engagement_rate,
    ig_posting_regularity: instagramUpdate.ig_posting_regularity ?? lead.ig_posting_regularity,
  }
}
