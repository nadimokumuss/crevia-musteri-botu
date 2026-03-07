/**
 * DBSCAN kümeleme algoritması - Coğrafi lead kümeleme
 *
 * K-means yerine DBSCAN: Küme sayısı önceden bilinmiyor,
 * Istanbul ticari bölgeleri doğal yoğunluk kümeleri oluşturuyor.
 */

import type { GeoPoint, Cluster } from '@/types/geo'
import { haversineDistance } from '@/lib/geo-utils'
import { getCentroid } from '@/lib/geo-utils'
import { CLUSTERING_DEFAULTS } from '@/lib/constants'

const UNVISITED = 0
const NOISE = -1

/**
 * DBSCAN kümeleme
 *
 * @param points - Kümelenecek coğrafi noktalar
 * @param epsilonMeters - Komşuluk yarıçapı (metre). Varsayılan: 500m
 * @param minPoints - Minimum komşu sayısı. Varsayılan: 3
 */
export function clusterLeads(
  points: GeoPoint[],
  epsilonMeters: number = CLUSTERING_DEFAULTS.EPSILON_METERS,
  minPoints: number = CLUSTERING_DEFAULTS.MIN_POINTS
): Cluster[] {
  if (points.length === 0) return []

  const epsilonKm = epsilonMeters / 1000
  const labels = new Int32Array(points.length) // 0 = UNVISITED

  let currentClusterId = 0

  for (let i = 0; i < points.length; i++) {
    if (labels[i] !== UNVISITED) continue

    const neighbors = regionQuery(points, i, epsilonKm)

    if (neighbors.length < minPoints) {
      labels[i] = NOISE
      continue
    }

    currentClusterId++
    labels[i] = currentClusterId

    const seedSet = new Set(neighbors)
    seedSet.delete(i)

    for (const idx of seedSet) {
      if (labels[idx] === NOISE) {
        labels[idx] = currentClusterId
      }

      if (labels[idx] !== UNVISITED) continue

      labels[idx] = currentClusterId

      const subNeighbors = regionQuery(points, idx, epsilonKm)
      if (subNeighbors.length >= minPoints) {
        for (const n of subNeighbors) {
          seedSet.add(n)
        }
      }
    }
  }

  // Sonuçları Cluster formatına dönüştür
  const clusterMap = new Map<number, GeoPoint[]>()
  const noisePoints: GeoPoint[] = []

  for (let i = 0; i < points.length; i++) {
    const label = labels[i]
    if (label === NOISE) {
      noisePoints.push(points[i])
    } else {
      if (!clusterMap.has(label)) {
        clusterMap.set(label, [])
      }
      clusterMap.get(label)!.push(points[i])
    }
  }

  const clusters: Cluster[] = []

  for (const [id, clusterPoints] of clusterMap) {
    clusters.push({
      id,
      centroid: getCentroid(clusterPoints),
      points: clusterPoints,
      isNoise: false,
    })
  }

  // Gürültü noktalarını tek bir küme olarak ekle (eğer varsa)
  if (noisePoints.length > 0) {
    clusters.push({
      id: -1,
      centroid: getCentroid(noisePoints),
      points: noisePoints,
      isNoise: true,
    })
  }

  return clusters
}

/**
 * Belirli bir noktanın epsilon yarıçapı içindeki tüm komşu indekslerini bul
 */
function regionQuery(points: GeoPoint[], pointIdx: number, epsilonKm: number): number[] {
  const neighbors: number[] = []
  const p = points[pointIdx]

  for (let i = 0; i < points.length; i++) {
    if (haversineDistance(p, points[i]) <= epsilonKm) {
      neighbors.push(i)
    }
  }

  return neighbors
}
