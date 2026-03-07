/**
 * Google Places API (New) adaptörü (birincil kaynak)
 *
 * Yeni Places API v1 endpoint'lerini kullanır.
 * https://developers.google.com/maps/documentation/places/web-service/op-overview
 */

import type { ILeadSource, LeadSourceQuery, LeadSourceResult } from './lead-source.interface'
import type { RawLeadData } from '@/types/lead'
import { ExternalServiceError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { RateLimiter, SCRAPER_RATE_LIMITS } from '@/lib/rate-limiter'

const GOOGLE_TYPE_TO_CATEGORY: Record<string, string> = {
  restaurant: 'Restoran',
  meal_delivery: 'Restoran',
  meal_takeaway: 'Restoran',
  cafe: 'Kafe',
  beauty_salon: 'Güzellik Salonu',
  hair_care: 'Güzellik Salonu',
  spa: 'Güzellik Salonu',
  gym: 'Spor Salonu',
  lodging: 'Otel',
  hotel: 'Otel',
  store: 'Mağaza',
  clothing_store: 'Mağaza',
  shopping_mall: 'Mağaza',
  doctor: 'Klinik',
  health: 'Klinik',
  hospital: 'Klinik',
  physiotherapist: 'Klinik',
  dentist: 'Diş Hekimi',
  lawyer: 'Avukat',
  real_estate_agency: 'Emlakçı',
  pharmacy: 'Eczane',
  drugstore: 'Eczane',
  veterinary_care: 'Veteriner',
  school: 'Eğitim / Kurs Merkezi',
  university: 'Eğitim / Kurs Merkezi',
  car_wash: 'Oto Yıkama',
  car_repair: 'Oto Servis',
  bakery: 'Pastane / Fırın',
  pet_store: 'Pet Shop',
  car_dealer: 'Oto Galeri',
  furniture_store: 'Mobilyacı',
  accounting: 'Muhasebeci',
}

interface PlaceNewResult {
  id: string
  displayName?: { text: string; languageCode: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  rating?: number
  userRatingCount?: number
  photos?: { name: string }[]
  businessStatus?: string
  nationalPhoneNumber?: string
  websiteUri?: string
  types?: string[]
}

interface TextSearchResponse {
  places?: PlaceNewResult[]
  nextPageToken?: string
}

export class GooglePlacesAdapter implements ILeadSource {
  readonly name = 'google-places'
  private readonly apiKey: string
  private readonly baseUrl = 'https://places.googleapis.com/v1/places'
  private readonly rateLimiter: RateLimiter

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.GOOGLE_PLACES_API_KEY ?? ''
    this.rateLimiter = new RateLimiter(SCRAPER_RATE_LIMITS.googlePlaces.requestsPerSecond)
  }

  async search(query: LeadSourceQuery): Promise<LeadSourceResult> {
    if (!this.apiKey) {
      throw new ExternalServiceError('Google Places', 'API anahtarı yapılandırılmamış')
    }

    try {
      const leads: RawLeadData[] = []
      let totalFound = 0
      let pageToken: string | undefined

      const location = query.districtName ? `${query.districtName} İstanbul` : 'İstanbul'
      const searchText = `${query.category ?? 'işletme'} ${location}`
      const fieldMask = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.rating',
        'places.userRatingCount',
        'places.photos',
        'places.businessStatus',
        'places.nationalPhoneNumber',
        'places.websiteUri',
        'places.types',
      ].join(',')

      do {
        const body: Record<string, unknown> = {
          textQuery: searchText,
          languageCode: 'tr',
          maxResultCount: 20,
        }

        if (pageToken) {
          body.pageToken = pageToken
        }

        // Rate limiting: API çağrıları arasında minimum bekleme süresi
        await this.rateLimiter.wait()

        const response = await fetch(`${this.baseUrl}:searchText`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new ExternalServiceError('Google Places', `HTTP ${response.status}: ${errorText}`)
        }

        const data: TextSearchResponse = await response.json()

        if (!data.places || data.places.length === 0) {
          break
        }

        for (const place of data.places) {
          let lead = this.mapToRawLead(place)

          // Telefon numarası yoksa Details API'den al
          if (!lead.phone && place.id) {
            try {
              const details = await this.getPlaceDetails(place.id)
              if (details.phone) {
                lead = { ...lead, phone: details.phone }
              }
              if (details.website && !lead.website) {
                lead = { ...lead, website: details.website }
              }
            } catch (detailsError) {
              // Details hatası ana işlemi durdurmasın
              logger.warn('Place details alınamadı', { placeId: place.id, error: String(detailsError) })
            }
          }

          leads.push(lead)
          totalFound++
          if (query.limit && totalFound >= query.limit) break
        }

        pageToken = data.nextPageToken
      } while (pageToken && (!query.limit || totalFound < query.limit))

      logger.info('Google Places arama tamamlandı', {
        districtId: query.districtId,
        totalFound,
      })

      return { leads, totalFound, source: this.name }
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error
      throw new ExternalServiceError(
        'Google Places',
        error instanceof Error ? error.message : 'Bilinmeyen hata'
      )
    }
  }

  async getPlaceDetails(placeId: string): Promise<Partial<RawLeadData>> {
    const fieldMask = 'nationalPhoneNumber,websiteUri'

    // Rate limiting: API çağrıları arasında minimum bekleme süresi
    await this.rateLimiter.wait()

    const response = await fetch(`${this.baseUrl}/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
    })

    if (!response.ok) {
      throw new ExternalServiceError('Google Places Details', `HTTP ${response.status}`)
    }

    const data: PlaceNewResult = await response.json()

    return {
      phone: data.nationalPhoneNumber,
      website: data.websiteUri,
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  private mapToRawLead(place: PlaceNewResult): RawLeadData {
    return {
      businessName: place.displayName?.text ?? '',
      category: this.resolveCategory(place.types),
      address: place.formattedAddress,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      googlePlaceId: place.id,
      googleRating: place.rating,
      googleReviewCount: place.userRatingCount,
      googlePhotoCount: place.photos?.length ?? 0,
      googleIsClaimed: place.businessStatus === 'OPERATIONAL',
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
    }
  }

  private resolveCategory(types?: string[]): string | undefined {
    if (!types) return undefined
    for (const type of types) {
      const category = GOOGLE_TYPE_TO_CATEGORY[type]
      if (category) return category
    }
    return undefined
  }
}
