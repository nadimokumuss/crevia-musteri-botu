/**
 * Agnostik IMapProvider arayüzü
 *
 * Faz 3'te implement edilecek.
 */

import type { GeoPoint } from '@/types/geo'

export interface DistanceResult {
  distanceKm: number
  durationMin: number
}

export interface IMapProvider {
  readonly name: string
  getDistance(from: GeoPoint, to: GeoPoint): Promise<DistanceResult>
  getDistanceMatrix(origins: GeoPoint[], destinations: GeoPoint[]): Promise<DistanceResult[][]>
}
