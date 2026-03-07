/**
 * Coğrafi yardımcı fonksiyonlar
 */

import type { GeoPoint, BoundingBox } from '@/types/geo'

/** Dünya yarıçapı (km) */
const EARTH_RADIUS_KM = 6371

/**
 * Haversine formülü ile iki nokta arasındaki mesafeyi hesapla (km)
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * Haversine mesafesi * kentsel düzeltme faktörü (Istanbul yol ağı)
 */
export function urbanDistance(a: GeoPoint, b: GeoPoint, factor: number = 1.3): number {
  return haversineDistance(a, b) * factor
}

/**
 * Nokta listesinden bounding box hesapla
 */
export function getBoundingBox(points: GeoPoint[]): BoundingBox {
  if (points.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }
  }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }

  return { minLat, maxLat, minLng, maxLng }
}

/**
 * Noktanın bounding box içinde olup olmadığını kontrol et
 */
export function isPointInBBox(point: GeoPoint, bbox: BoundingBox): boolean {
  return (
    point.lat >= bbox.minLat &&
    point.lat <= bbox.maxLat &&
    point.lng >= bbox.minLng &&
    point.lng <= bbox.maxLng
  )
}

/**
 * Nokta listesinin ağırlıklı merkezini hesapla (centroid)
 */
export function getCentroid(points: GeoPoint[]): GeoPoint {
  if (points.length === 0) {
    return { lat: 0, lng: 0 }
  }

  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  )

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  }
}
