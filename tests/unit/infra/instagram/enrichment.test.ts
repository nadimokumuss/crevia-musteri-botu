import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runInstagramEnrichment } from '@/infra/instagram/enrichment'
import { logger } from '@/lib/logger'
import type { Lead } from '@/types/database'

const {
  loadPendingInstagramLeads,
  countPendingInstagramLeads,
  discoverOrBackfillInstagramProfileForLead,
  needsInstagramProfileBackfill,
  updateLeadWithInstagramSchemaFallback,
} = vi.hoisted(() => ({
  loadPendingInstagramLeads: vi.fn(),
  countPendingInstagramLeads: vi.fn(),
  discoverOrBackfillInstagramProfileForLead: vi.fn(),
  needsInstagramProfileBackfill: vi.fn(),
  updateLeadWithInstagramSchemaFallback: vi.fn(),
}))

vi.mock('@/infra/instagram/pending-leads', () => ({
  loadPendingInstagramLeads,
  countPendingInstagramLeads,
}))

vi.mock('@/infra/instagram/discovery', () => ({
  buildInstagramLeadUpdate: vi.fn(),
  discoverOrBackfillInstagramProfileForLead,
  needsInstagramProfileBackfill,
}))

vi.mock('@/infra/instagram/schema-fallback', () => ({
  updateLeadWithInstagramSchemaFallback,
}))

vi.mock('@/core/scoring/need-score', () => ({
  calculateNeedScore: vi.fn(() => ({
    totalScore: 0,
    googleSubScore: 0,
    instagramSubScore: 0,
    websiteSubScore: 0,
    marketingSubScore: 0,
    recommendation: 'SKIP',
  })),
}))

vi.mock('@/lib/signal-builders', () => ({
  buildGoogleSignals: vi.fn(() => null),
  buildMarketingSignals: vi.fn(() => null),
  buildWebsiteSignals: vi.fn(() => null),
}))

vi.spyOn(logger, 'warn').mockImplementation(() => {})

function createLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    district_id: 'district-1',
    business_name: 'Moda Kafe',
    category: 'Kafe',
    address: null,
    phone: null,
    email: null,
    website: 'https://modakafe.com',
    lat: null,
    lng: null,
    google_place_id: null,
    google_rating: null,
    google_review_count: null,
    google_photo_count: null,
    google_is_claimed: null,
    google_last_updated: null,
    google_response_rate: null,
    ig_username: null,
    ig_discovery_source: null,
    ig_follower_count: null,
    ig_post_count: null,
    ig_avg_likes: null,
    ig_last_post_date: null,
    ig_has_highlights: null,
    ig_bio_contains_agency: null,
    ig_has_bio_link: null,
    ig_posting_regularity: null,
    ig_engagement_rate: null,
    ig_reels_ratio: null,
    website_speed_score: null,
    website_is_mobile_friendly: null,
    website_has_404s: null,
    website_has_meta_pixel: null,
    website_has_ga4: null,
    has_active_meta_ads: null,
    email_source: null,
    need_score: 0,
    google_sub_score: 0,
    instagram_sub_score: 0,
    website_sub_score: 0,
    marketing_sub_score: 0,
    recommendation: 'SKIP',
    status: 'NEW',
    notes: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('runInstagramEnrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    needsInstagramProfileBackfill.mockReturnValue(false)
  })

  it('basarisiz taze leadi retry kuy ruguna tasir ve denendi sayisina katar', async () => {
    const lead = createLead()
    const supabase = {} as never

    loadPendingInstagramLeads.mockResolvedValueOnce({
      leads: [lead],
      error: null,
    })
    countPendingInstagramLeads.mockResolvedValueOnce(25)
    discoverOrBackfillInstagramProfileForLead.mockRejectedValueOnce(new Error('timeout'))

    const result = await runInstagramEnrichment(supabase, {} as never, {
      batchSize: 1,
      maxLeads: 1,
      includeBackfill: false,
      includeRetries: false,
    })

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(1)
    expect(updateLeadWithInstagramSchemaFallback).toHaveBeenCalledWith(
      supabase,
      lead.id,
      {
        ig_username: '',
        ig_discovery_source: null,
      }
    )
  })

  it('aynı leadi tek çalıştırmada tekrar tekrar denemez', async () => {
    const lead = createLead()

    loadPendingInstagramLeads
      .mockResolvedValueOnce({
        leads: [lead],
        error: null,
      })
      .mockResolvedValueOnce({
        leads: [lead],
        error: null,
      })

    countPendingInstagramLeads.mockResolvedValueOnce(99)
    discoverOrBackfillInstagramProfileForLead.mockRejectedValue(new Error('apify failed'))

    const result = await runInstagramEnrichment({} as never, {} as never, {
      batchSize: 1,
      maxLeads: 5,
      includeBackfill: false,
      includeRetries: false,
    })

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(1)
    expect(discoverOrBackfillInstagramProfileForLead).toHaveBeenCalledTimes(1)
    expect(loadPendingInstagramLeads).toHaveBeenCalledTimes(2)
  })
})
