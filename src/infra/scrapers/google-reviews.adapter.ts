/**
 * Google Reviews yorum yanıt oranı adaptörü
 *
 * Apify Google Maps Reviews Scraper kullanarak
 * işletmenin son yorumlarına yanıt oranını hesaplar.
 */

import { ExternalServiceError } from '@/lib/errors'
import { logger } from '@/lib/logger'

interface ReviewData {
  text?: string
  reviewerName?: string
  responseFromOwner?: string | null
}

interface ApifyRunResponse {
  data: {
    id: string
    status: string
    defaultDatasetId: string
  }
}

export class GoogleReviewsAdapter {
  private readonly apiToken: string
  private readonly baseUrl = 'https://api.apify.com/v2'
  private readonly actorId = 'apify~google-maps-reviews-scraper'

  constructor(apiToken?: string) {
    this.apiToken = apiToken ?? process.env.APIFY_API_TOKEN ?? ''
  }

  async getResponseRate(placeId: string): Promise<number | null> {
    if (!this.apiToken) {
      logger.warn('Google Reviews yanıt oranı atlandı: APIFY_API_TOKEN yok')
      return null
    }

    try {
      const runResponse = await fetch(
        `${this.baseUrl}/acts/${this.actorId}/runs?token=${this.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeIds: [placeId],
            maxReviews: 10,
            language: 'tr',
          }),
        }
      )

      if (!runResponse.ok) {
        logger.warn('Google Reviews actor başlatılamadı', { status: runResponse.status })
        return null
      }

      const runData: ApifyRunResponse = await runResponse.json()
      const datasetId = await this.waitForCompletion(runData.data.id)

      const dataResponse = await fetch(
        `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiToken}&format=json`
      )

      if (!dataResponse.ok) {
        logger.warn('Google Reviews veri alınamadı', { status: dataResponse.status })
        return null
      }

      const reviews: ReviewData[] = await dataResponse.json()

      if (reviews.length === 0) return null

      const withResponse = reviews.filter((r) => r.responseFromOwner).length
      return withResponse / reviews.length
    } catch (error) {
      logger.warn('Google Reviews yanıt oranı hatası', { placeId, error: String(error) })
      return null
    }
  }

  private async waitForCompletion(runId: string, maxWaitMs: number = 60000): Promise<string> {
    const startTime = Date.now()
    const pollInterval = 3000

    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetch(
        `${this.baseUrl}/actor-runs/${runId}?token=${this.apiToken}`
      )

      if (!response.ok) {
        throw new ExternalServiceError('GoogleReviews', `Run durumu alınamadı: HTTP ${response.status}`)
      }

      const data: ApifyRunResponse = await response.json()

      if (data.data.status === 'SUCCEEDED') {
        return data.data.defaultDatasetId
      }

      if (data.data.status === 'FAILED' || data.data.status === 'ABORTED') {
        throw new ExternalServiceError('GoogleReviews', `Actor başarısız: ${data.data.status}`)
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    throw new ExternalServiceError('GoogleReviews', 'Zaman aşımı')
  }
}
