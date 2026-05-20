/**
 * Apify adaptörü (ikincil kaynak)
 *
 * Google Maps Scraper actor'unu kullanarak veri çeker.
 */

import type { ILeadSource, LeadSourceQuery, LeadSourceResult } from './lead-source.interface'
import type { RawLeadData } from '@/types/lead'
import { ExternalServiceError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { RateLimiter, SCRAPER_RATE_LIMITS } from '@/lib/rate-limiter'

interface ApifyGoogleMapsResult {
  title: string
  address?: string
  location?: { lat: number; lng: number }
  totalScore?: number
  reviewsCount?: number
  imageUrls?: string[]
  phone?: string
  email?: string
  website?: string
  categoryName?: string
  placeId?: string
  claimThisBusiness?: boolean
}

interface ApifyRunResponse {
  data: {
    id: string
    status: string
    defaultDatasetId: string
  }
}

export class ApifyAdapter implements ILeadSource {
  readonly name = 'apify'
  private readonly apiToken: string
  private readonly baseUrl = 'https://api.apify.com/v2'
  private readonly actorId = 'compass/crawler-google-places'
  private readonly rateLimiter: RateLimiter

  constructor(apiToken?: string) {
    this.apiToken = apiToken ?? process.env.APIFY_API_TOKEN ?? ''
    this.rateLimiter = new RateLimiter(SCRAPER_RATE_LIMITS.apify.requestsPerSecond)
  }

  async search(query: LeadSourceQuery): Promise<LeadSourceResult> {
    if (!this.apiToken) {
      throw new ExternalServiceError('Apify', 'API token yapılandırılmamış')
    }

    try {
      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      // Actor'u başlat (10 saniye timeout)
      const runResponse = await fetch(
        `${this.baseUrl}/acts/${this.actorId}/runs?token=${this.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchStringsArray: [query.category ?? 'işletme'],
            locationQuery: query.districtName
              ? `${query.districtName}, İstanbul, Türkiye`
              : 'İstanbul, Türkiye',
            language: 'tr',
            maxCrawledPlacesPerSearch: query.limit ?? 50,
          }),
          signal: AbortSignal.timeout(10000),
        }
      )

      if (!runResponse.ok) {
        const errorText = await runResponse.text()
        logger.warn('Apify actor başlatma başarısız', {
          status: runResponse.status,
          body: errorText.slice(0, 500),
        })
        throw new ExternalServiceError('Apify', `Actor başlatılamadı: HTTP ${runResponse.status}`)
      }

      const runData: ApifyRunResponse = await runResponse.json()
      const runId = runData.data.id

      // Sonuçları bekle (polling)
      const datasetId = await this.waitForCompletion(runId)

      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      // Verileri al (15 saniye timeout)
      const dataResponse = await fetch(
        `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiToken}&format=json`,
        { signal: AbortSignal.timeout(15000) }
      )

      if (!dataResponse.ok) {
        const errorText = await dataResponse.text()
        logger.warn('Apify veri alma başarısız', {
          status: dataResponse.status,
          body: errorText.slice(0, 500),
        })
        throw new ExternalServiceError('Apify', `Veri alınamadı: HTTP ${dataResponse.status}`)
      }

      const items: ApifyGoogleMapsResult[] = await dataResponse.json()

      const leads = items.map((item) => this.mapToRawLead(item))

      logger.info('Apify arama tamamlandı', {
        districtId: query.districtId,
        totalFound: leads.length,
      })

      return { leads, totalFound: leads.length, source: this.name }
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error
      throw new ExternalServiceError(
        'Apify',
        error instanceof Error ? error.message : 'Bilinmeyen hata'
      )
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiToken
  }

  /**
   * Actor çalışmasının tamamlanmasını bekle (polling)
   * Vercel 60s limit nedeniyle maxWaitMs = 45s olarak ayarlandı
   */
  private async waitForCompletion(runId: string, maxWaitMs: number = 45000): Promise<string> {
    const startTime = Date.now()
    const pollInterval = 3000 // 3 saniye arayla kontrol

    while (Date.now() - startTime < maxWaitMs) {
      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      const response = await fetch(
        `${this.baseUrl}/actor-runs/${runId}?token=${this.apiToken}`,
        { signal: AbortSignal.timeout(10000) } // Her poll için 10s timeout
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.warn('Apify run durumu alma başarısız', {
          status: response.status,
          body: errorText.slice(0, 500),
        })
        throw new ExternalServiceError('Apify', `Run durumu alınamadı: HTTP ${response.status}`)
      }

      const data: ApifyRunResponse = await response.json()

      if (data.data.status === 'SUCCEEDED') {
        return data.data.defaultDatasetId
      }

      if (data.data.status === 'FAILED' || data.data.status === 'ABORTED') {
        throw new ExternalServiceError('Apify', `Actor çalışması başarısız: ${data.data.status}`)
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    throw new ExternalServiceError('Apify', 'Zaman aşımı: Actor çalışması tamamlanmadı')
  }

  private mapToRawLead(item: ApifyGoogleMapsResult): RawLeadData {
    return {
      businessName: item.title,
      address: item.address,
      lat: item.location?.lat,
      lng: item.location?.lng,
      googlePlaceId: item.placeId,
      googleRating: item.totalScore,
      googleReviewCount: item.reviewsCount,
      googlePhotoCount: item.imageUrls?.length ?? 0,
      googleIsClaimed: item.claimThisBusiness !== true,
      phone: item.phone,
      email: item.email,
      website: item.website,
      category: item.categoryName,
    }
  }
}
