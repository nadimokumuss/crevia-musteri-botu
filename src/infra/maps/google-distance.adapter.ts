/**
 * Google Distance Matrix API adaptörü
 *
 * Gerçek yol mesafesi ve süresini hesaplar (kuş uçuşu yerine).
 */

import type { GeoPoint } from '@/types/geo'
import type { IMapProvider, DistanceResult } from './map-provider.interface'
import { ExternalServiceError } from '@/lib/errors'
import { logger } from '@/lib/logger'

interface DistanceMatrixResponse {
  status: string
  rows: {
    elements: {
      status: string
      distance?: { value: number; text: string }
      duration?: { value: number; text: string }
    }[]
  }[]
  error_message?: string
}

export class GoogleDistanceAdapter implements IMapProvider {
  readonly name = 'google-distance-matrix'
  private readonly apiKey: string
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json'

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? ''
  }

  async getDistance(from: GeoPoint, to: GeoPoint): Promise<DistanceResult> {
    if (!this.apiKey) {
      throw new ExternalServiceError('Google Distance Matrix', 'API anahtarı yapılandırılmamış')
    }

    const matrix = await this.getDistanceMatrix([from], [to])
    return matrix[0][0]
  }

  async getDistanceMatrix(
    origins: GeoPoint[],
    destinations: GeoPoint[]
  ): Promise<DistanceResult[][]> {
    if (!this.apiKey) {
      throw new ExternalServiceError('Google Distance Matrix', 'API anahtarı yapılandırılmamış')
    }

    const originStr = origins.map((p) => `${p.lat},${p.lng}`).join('|')
    const destStr = destinations.map((p) => `${p.lat},${p.lng}`).join('|')

    const url = new URL(this.baseUrl)
    url.searchParams.set('origins', originStr)
    url.searchParams.set('destinations', destStr)
    url.searchParams.set('mode', 'driving')
    url.searchParams.set('language', 'tr')
    url.searchParams.set('key', this.apiKey)

    const response = await fetch(url.toString())

    if (!response.ok) {
      throw new ExternalServiceError('Google Distance Matrix', `HTTP ${response.status}`)
    }

    const data: DistanceMatrixResponse = await response.json()

    if (data.status !== 'OK') {
      throw new ExternalServiceError(
        'Google Distance Matrix',
        data.error_message ?? data.status
      )
    }

    const results: DistanceResult[][] = data.rows.map((row) =>
      row.elements.map((el) => {
        if (el.status !== 'OK') {
          logger.warn('Distance Matrix element ulaşılamaz', { status: el.status })
          return { distanceKm: Infinity, durationMin: Infinity }
        }
        return {
          distanceKm: (el.distance?.value ?? 0) / 1000,
          durationMin: Math.round((el.duration?.value ?? 0) / 60),
        }
      })
    )

    logger.info('Distance Matrix hesaplandı', {
      origins: origins.length,
      destinations: destinations.length,
    })

    return results
  }
}
