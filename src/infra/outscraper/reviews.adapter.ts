/**
 * Outscraper Google Maps Reviews adaptoru
 *
 * Google Business Profile yorumlarini ICERIK ile cekmek icin.
 * Resmi Places API yorum metni icin Enterprise SKU gerektirir;
 * Outscraper (~$0.003/review) cok daha ekonomik.
 *
 * Fail-soft: API key yoksa null doner; cagiran taraf basic GBP data ile devam etmelidir.
 * Cache TTL kontrolu cagiran tarafin sorumlulugu (gbp_reviews_fetched_at sutunu).
 */

import { logger } from '@/lib/logger'

export interface ReviewItem {
  rating: number
  text: string | null
  date: string
  hasOwnerResponse: boolean
}

export interface ReviewsSummary {
  count: number
  avgRating: number
  /** 0-1 arasi; sahibin cevap verdigi yorumlarin orani */
  responseRate: number
  /** En yeni 10 yorum, audit prompt'u icin yeterli baglam */
  recentReviews: ReviewItem[]
}

interface OutscraperReviewItem {
  review_text?: string | null
  review_rating?: number
  review_datetime_utc?: string
  owner_answer?: string | null
}

interface OutscraperResponse {
  data?: Array<{
    place_id?: string
    reviews_data?: OutscraperReviewItem[]
  }>
  status?: string
  error?: string
}

const OUTSCRAPER_BASE_URL = 'https://api.app.outscraper.com'
const DEFAULT_REVIEWS_LIMIT = 20
const REQUEST_TIMEOUT_MS = 30_000

export class OutscraperReviewsAdapter {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(apiKey?: string, baseUrl: string = OUTSCRAPER_BASE_URL) {
    this.apiKey = apiKey ?? process.env.OUTSCRAPER_API_KEY ?? ''
    this.baseUrl = baseUrl
  }

  async fetchReviewsSummary(placeId: string): Promise<ReviewsSummary | null> {
    if (!this.apiKey) {
      logger.warn('Outscraper review zenginlestirme atlandi: OUTSCRAPER_API_KEY yok')
      return null
    }

    if (!placeId) {
      return null
    }

    const url = new URL(`${this.baseUrl}/maps/reviews-v3`)
    url.searchParams.set('query', placeId)
    url.searchParams.set('reviewsLimit', String(DEFAULT_REVIEWS_LIMIT))
    url.searchParams.set('sort', 'newest')
    url.searchParams.set('async', 'false')
    url.searchParams.set('language', 'tr')

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'X-API-KEY': this.apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!response.ok) {
        logger.warn('Outscraper review API hatali yanit', {
          status: response.status,
          placeId,
        })
        return null
      }

      const payload = (await response.json()) as OutscraperResponse

      if (payload.error) {
        logger.warn('Outscraper review API error payload', {
          error: payload.error,
          placeId,
        })
        return null
      }

      const reviews = payload.data?.[0]?.reviews_data ?? []

      if (reviews.length === 0) {
        return {
          count: 0,
          avgRating: 0,
          responseRate: 0,
          recentReviews: [],
        }
      }

      const ratings = reviews
        .map((r) => r.review_rating)
        .filter((r): r is number => typeof r === 'number')

      const avgRating =
        ratings.length > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : 0

      const withResponse = reviews.filter((r) => !!r.owner_answer).length
      const responseRate = Math.round((withResponse / reviews.length) * 100) / 100

      return {
        count: reviews.length,
        avgRating,
        responseRate,
        recentReviews: reviews.slice(0, 10).map((r) => ({
          rating: r.review_rating ?? 0,
          text: r.review_text ?? null,
          date: r.review_datetime_utc ?? new Date().toISOString(),
          hasOwnerResponse: !!r.owner_answer,
        })),
      }
    } catch (error) {
      logger.warn('Outscraper review fetch hatasi', {
        placeId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
}
