import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Lead } from '@/types/database'
import type { ReviewsSummary } from '@/infra/outscraper/reviews.adapter'

// Anthropic SDK mock
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock }
    },
  }
})

const { synthesizeAudit } = await import('@/core/audit/llm-synthesis')

const baseLead: Lead = {
  id: 'lead-1',
  district_id: null,
  business_name: 'Mavi Cafe',
  category: 'cafe',
  address: null,
  phone: null,
  email: null,
  website: null,
  lat: null,
  lng: null,
  google_place_id: 'place-1',
  google_rating: 4.2,
  google_review_count: 50,
  google_photo_count: 20,
  google_is_claimed: true,
  google_last_updated: null,
  google_response_rate: 0.3,
  ig_username: 'mavicafe',
  ig_discovery_source: 'WEBSITE_HTML',
  ig_follower_count: 1200,
  ig_post_count: 80,
  ig_avg_likes: 15,
  ig_last_post_date: '2026-04-01',
  ig_has_highlights: true,
  ig_bio_contains_agency: false,
  ig_has_bio_link: false,
  ig_posting_regularity: 'irregular',
  ig_engagement_rate: 0.012,
  ig_reels_ratio: 0.1,
  website_speed_score: 45,
  website_is_mobile_friendly: false,
  website_has_404s: false,
  website_has_meta_pixel: false,
  website_has_ga4: false,
  has_active_meta_ads: false,
  email_source: null,
  need_score: 72,
  google_sub_score: 18,
  instagram_sub_score: 22,
  website_sub_score: 20,
  marketing_sub_score: 12,
  recommendation: 'HIGH_PRIORITY',
  status: 'NEW',
  notes: null,
  audit_narrative: null,
  audit_strengths: null,
  audit_gaps: null,
  audit_tier: null,
  phone_script: null,
  outreach_email_subject: null,
  outreach_email_body: null,
  audit_share_slug: null,
  audit_generated_at: null,
  audit_model: null,
  gbp_reviews_fetched_at: null,
  gbp_reviews_summary: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
}

const validToolOutput = {
  narrative:
    'Mavi Cafe orta segmentte konumlanmis bir kafe. GBP profili populer (4.2 yildiz, 50 yorum) ama sahibin yorum yanit orani dusuk (%30). Instagram profili duzensiz, engagement %1.2. Web sitesi yok ya da bulunamadi.',
  strengths: [
    { area: 'GBP yildizi', note: '4.2 yildiz solid bir baseline saglar' },
    { area: 'IG hesabi mevcut', note: '1200 takipci ile reklam icin yeterli kitle' },
  ],
  gaps: [
    {
      area: 'Web sitesi',
      severity: 'high',
      note: 'Hic web sitesi yok',
      talking_point: 'Web sitesi olmadan kampanya yatirimlariniz buharlasiyor; basit bir landing 2 haftada hazir.',
    },
    {
      area: 'GBP yanit orani',
      severity: 'med',
      note: 'Sahip yorumlarin %30una cevap veriyor',
      talking_point: '%80+ yanit orani GBP siralamanizi belirgin yukseltir; biz takip alarmlari kurabiliriz.',
    },
  ],
  tier: 'A',
  phone_script:
    'Merhaba, Crevia satis ekibinden ariyorum. Profilinizi inceledim; 4.2 yildiziniz iyi ama web siteniz yok ve yorumlara cevap orani dusuk. 10 dakika konusabilir miyiz?',
  outreach_email_subject: 'Crevia: Mavi Cafe icin hizli iyilestirme tavsiyesi',
  outreach_email_body:
    'Merhaba, Mavi Cafe GBP profilinizi ve Instagram\'i inceledim. 4.2 yildiziniz iyi bir baslangic ama web sitesi olmadan dijital reklam yatiriminiz parcalaniyor. Yorum yanit oraniniz da %30 — bunu %80+ yapabilirsek GBP siralamaniz belirgin yukselir. Kisa bir Zoom toplantisina vaktiniz var mi?',
}

describe('synthesizeAudit', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockReset()
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  it('API key yoksa hata firlatir', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(synthesizeAudit({ lead: baseLead, reviewsSummary: null })).rejects.toThrow(
      /ANTHROPIC_API_KEY/
    )
  })

  it('happy path: tool cagrisini parse eder ve cost hesaplar', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'submit_audit', id: 'toolu_1', input: validToolOutput }],
      usage: {
        input_tokens: 200,
        output_tokens: 800,
        cache_creation_input_tokens: 1500,
        cache_read_input_tokens: 0,
      },
    })

    const result = await synthesizeAudit({ lead: baseLead, reviewsSummary: null })

    expect(result.tier).toBe('A')
    expect(result.modelId).toBe('claude-sonnet-4-6')
    expect(result.strengths).toHaveLength(2)
    expect(result.gaps).toHaveLength(2)
    expect(result.actualCostUsd).toBeGreaterThan(0)
    // 200*3 + 1500*3.75 + 0*0.3 + 800*15 = 600 + 5625 + 0 + 12000 = 18225 / 1e6 = $0.018225
    expect(result.actualCostUsd).toBeCloseTo(0.018225, 5)
  })

  it('tool cagirmazsa hata firlatir', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'reddediyorum' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    await expect(synthesizeAudit({ lead: baseLead, reviewsSummary: null })).rejects.toThrow(
      /submit_audit/
    )
  })

  it('Zod validation failure hata firlatir', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          name: 'submit_audit',
          id: 'toolu_1',
          input: { ...validToolOutput, tier: 'D' }, // invalid tier
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    await expect(synthesizeAudit({ lead: baseLead, reviewsSummary: null })).rejects.toThrow(
      /dogrulama/
    )
  })

  it('reviewsSummary varsa user prompt\'a dahil edilir', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'submit_audit', id: 'toolu_1', input: validToolOutput }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const reviews: ReviewsSummary = {
      count: 5,
      avgRating: 4.4,
      responseRate: 0.6,
      recentReviews: [
        { rating: 5, text: 'Cok guzeldi', date: '2026-04-10', hasOwnerResponse: true },
      ],
    }

    await synthesizeAudit({ lead: baseLead, reviewsSummary: reviews })

    const callArgs = createMock.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage).toContain('Cok guzeldi')
    expect(userMessage).toContain('4.4/5')
  })
})
