import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildInstagramLeadUpdate,
  buildInstagramSeedUpdateFromWebsite,
  discoverInstagramProfileForLead,
  discoverOrBackfillInstagramProfileForLead,
  needsInstagramProfileBackfill,
} from '@/infra/instagram/discovery'
import type { Lead } from '@/types/database'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    district_id: 'district-1',
    business_name: 'Kadikoy Kafe',
    category: 'Kafe',
    address: null,
    phone: null,
    email: null,
    website: null,
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
    created_at: '2026-03-31T00:00:00.000Z',
    updated_at: '2026-03-31T00:00:00.000Z',
    ...overrides,
  }
}

function createAdapter() {
  return {
    analyzeProfile: vi.fn(),
    findBusinessProfile: vi.fn(),
  } as const
}

describe('instagram discovery helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('website alanı zaten Instagram ise profil detayı alınamasa da usernamei döndürür', async () => {
    const adapter = createAdapter()
    adapter.analyzeProfile.mockRejectedValueOnce(new Error('timeout'))

    const result = await discoverInstagramProfileForLead(
      createLead({ website: 'https://instagram.com/kadikoy.kafe' }),
      adapter as never
    )

    expect(result).toEqual(
      expect.objectContaining({
        username: 'kadikoy.kafe',
        source: 'WEBSITE_URL',
      })
    )
    expect(result?.profileData.igUsername).toBe('kadikoy.kafe')
    expect(adapter.findBusinessProfile).not.toHaveBeenCalled()
  })

  it('website HTML icindeki Instagram linkini kullanir', async () => {
    const adapter = createAdapter()
    adapter.analyzeProfile.mockResolvedValueOnce({
      igUsername: 'modacafe',
      igFollowerCount: 4800,
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<a href="https://instagram.com/modacafe">Instagram</a>',
    })

    const result = await discoverInstagramProfileForLead(
      createLead({ website: 'https://modacafe.com' }),
      adapter as never
    )

    expect(result?.source).toBe('WEBSITE_HTML')
    expect(result?.username).toBe('modacafe')
    expect(adapter.analyzeProfile).toHaveBeenCalledWith('modacafe')
  })

  it('tahmin + dogrulama fallbackini kullanir', async () => {
    const adapter = createAdapter()
    adapter.findBusinessProfile.mockResolvedValueOnce({
      igUsername: 'gunesklinik',
      igFollowerCount: 1200,
    })

    const result = await discoverInstagramProfileForLead(
      createLead({
        business_name: 'Gunes Klinik',
        category: 'Klinik',
        website: null,
      }),
      adapter as never
    )

    expect(result?.source).toBe('CANDIDATE_VERIFIED')
    expect(result?.username).toBe('gunesklinik')
  })

  it('dogrudan bulunan hesaplar icin profile backfill gereksinimini tespit eder', async () => {
    const lead = createLead({
      ig_username: 'modacafe',
      ig_discovery_source: 'WEBSITE_URL',
    })

    expect(needsInstagramProfileBackfill(lead)).toBe(true)
    expect(buildInstagramSeedUpdateFromWebsite('https://instagram.com/modacafe')).toEqual({
      ig_username: 'modacafe',
      ig_discovery_source: 'WEBSITE_URL',
    })
  })

  it('mevcut direct username icin backfill yapar ve update payloadini korur', async () => {
    const adapter = createAdapter()
    adapter.analyzeProfile.mockResolvedValueOnce({
      igUsername: 'modacafe',
      igFollowerCount: 6000,
      igPostCount: 180,
      igAvgLikes: 240,
    })

    const discovery = await discoverOrBackfillInstagramProfileForLead(
      createLead({
        ig_username: 'modacafe',
        ig_discovery_source: 'WEBSITE_URL',
      }),
      adapter as never
    )

    expect(discovery?.source).toBe('WEBSITE_URL')
    expect(adapter.analyzeProfile).toHaveBeenCalledWith('modacafe')
    expect(buildInstagramLeadUpdate(discovery!)).toEqual(
      expect.objectContaining({
        ig_username: 'modacafe',
        ig_discovery_source: 'WEBSITE_URL',
        ig_follower_count: 6000,
        ig_post_count: 180,
      })
    )
  })
})
