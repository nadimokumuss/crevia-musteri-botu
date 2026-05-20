import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OutscraperReviewsAdapter } from '@/infra/outscraper/reviews.adapter'

describe('OutscraperReviewsAdapter', () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.OUTSCRAPER_API_KEY

  beforeEach(() => {
    process.env.OUTSCRAPER_API_KEY = 'test-key'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) {
      delete process.env.OUTSCRAPER_API_KEY
    } else {
      process.env.OUTSCRAPER_API_KEY = originalKey
    }
    vi.restoreAllMocks()
  })

  it('API key yoksa null doner ve fetch cagrisi yapmaz', async () => {
    delete process.env.OUTSCRAPER_API_KEY
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new OutscraperReviewsAdapter()
    const result = await adapter.fetchReviewsSummary('place-1')

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('placeId bos ise null doner', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new OutscraperReviewsAdapter()
    const result = await adapter.fetchReviewsSummary('')

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('happy path: review listesini ozetler', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              place_id: 'place-1',
              reviews_data: [
                {
                  review_text: 'Harika!',
                  review_rating: 5,
                  review_datetime_utc: '2026-04-01T12:00:00Z',
                  owner_answer: 'Tesekkurler!',
                },
                {
                  review_text: 'Fena degil',
                  review_rating: 3,
                  review_datetime_utc: '2026-03-15T10:00:00Z',
                  owner_answer: null,
                },
                {
                  review_text: 'Kotu',
                  review_rating: 1,
                  review_datetime_utc: '2026-02-01T09:00:00Z',
                  owner_answer: 'Geri donus icin tesekkurler.',
                },
              ],
            },
          ],
        }),
        { status: 200 }
      )
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new OutscraperReviewsAdapter()
    const result = await adapter.fetchReviewsSummary('place-1')

    expect(result).not.toBeNull()
    expect(result?.count).toBe(3)
    expect(result?.avgRating).toBe(3) // (5+3+1)/3 = 3
    expect(result?.responseRate).toBe(0.67) // 2/3 ~= 0.67
    expect(result?.recentReviews).toHaveLength(3)
    expect(result?.recentReviews[0]).toEqual({
      rating: 5,
      text: 'Harika!',
      date: '2026-04-01T12:00:00Z',
      hasOwnerResponse: true,
    })

    // URL parametrelerini dogrula
    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toContain('query=place-1')
    expect(calledUrl).toContain('reviewsLimit=20')
    expect(calledUrl).toContain('sort=newest')
    expect(calledUrl).toContain('language=tr')
  })

  it('bos review listesi icin sifir-degerli summary doner', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ place_id: 'place-2', reviews_data: [] }] }),
        { status: 200 }
      )
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new OutscraperReviewsAdapter()
    const result = await adapter.fetchReviewsSummary('place-2')

    expect(result).toEqual({
      count: 0,
      avgRating: 0,
      responseRate: 0,
      recentReviews: [],
    })
  })

  it('HTTP hata durumunda null doner (fail-soft)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 })
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new OutscraperReviewsAdapter()
    const result = await adapter.fetchReviewsSummary('place-3')

    expect(result).toBeNull()
  })

  it('payload error alaninda null doner', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'invalid place_id' }),
        { status: 200 }
      )
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new OutscraperReviewsAdapter()
    const result = await adapter.fetchReviewsSummary('place-bad')

    expect(result).toBeNull()
  })

  it('fetch exception ile null doner (network hatasi)', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new OutscraperReviewsAdapter()
    const result = await adapter.fetchReviewsSummary('place-x')

    expect(result).toBeNull()
  })
})
