/**
 * Coğrafi veri tip tanımları
 */

export interface GeoPoint {
  lat: number
  lng: number
  id?: string
  label?: string
}

export interface BoundingBox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface Cluster {
  id: number
  centroid: GeoPoint
  points: GeoPoint[]
  isNoise: boolean
}

export interface OptimizedRoute {
  orderedStops: GeoPoint[]
  totalDistanceKm: number
  estimatedDurationMin: number
}
