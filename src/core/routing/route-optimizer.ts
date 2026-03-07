/**
 * Nearest Neighbor + 2-opt TSP çözücü
 *
 * 8-15 durak için 50ms altında çalışır, optimalin ~%5'i içinde sonuç.
 * Mesafe: Haversine * 1.3 düzeltme faktörü (Istanbul kentsel yol ağı).
 */

import type { GeoPoint, OptimizedRoute } from '@/types/geo'
import { urbanDistance } from '@/lib/geo-utils'
import { ROUTE_DEFAULTS } from '@/lib/constants'

/**
 * Rota optimize et
 *
 * @param stops - Ziyaret edilecek noktalar
 * @param startPoint - Başlangıç noktası (ajan lokasyonu)
 * @param urbanFactor - Kentsel düzeltme faktörü. Varsayılan: 1.3
 */
export function optimizeRoute(
  stops: GeoPoint[],
  startPoint: GeoPoint,
  urbanFactor: number = ROUTE_DEFAULTS.URBAN_ROAD_FACTOR
): OptimizedRoute {
  if (stops.length === 0) {
    return { orderedStops: [], totalDistanceKm: 0, estimatedDurationMin: 0 }
  }

  if (stops.length === 1) {
    const dist = urbanDistance(startPoint, stops[0], urbanFactor)
    return {
      orderedStops: [stops[0]],
      totalDistanceKm: dist,
      estimatedDurationMin: estimateDuration(dist, 1),
    }
  }

  // Mesafe matrisi oluştur
  const allPoints = [startPoint, ...stops]
  const n = allPoints.length
  const distMatrix = buildDistanceMatrix(allPoints, urbanFactor)

  // 1) Nearest Neighbor heuristiği
  let route = nearestNeighbor(n, distMatrix)

  // 2) 2-opt yerel arama iyileştirmesi
  route = twoOpt(route, distMatrix)

  // Başlangıç noktasını (indeks 0) çıkar, sadece durakları döndür
  const orderedStops = route
    .filter((i) => i !== 0)
    .map((i) => allPoints[i])

  const totalDistanceKm = calculateRouteDistance(route, distMatrix)

  return {
    orderedStops,
    totalDistanceKm,
    estimatedDurationMin: estimateDuration(totalDistanceKm, orderedStops.length),
  }
}

/**
 * Mesafe matrisi oluştur (NxN)
 */
function buildDistanceMatrix(points: GeoPoint[], urbanFactor: number): number[][] {
  const n = points.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = urbanDistance(points[i], points[j], urbanFactor)
      matrix[i][j] = dist
      matrix[j][i] = dist
    }
  }

  return matrix
}

/**
 * Nearest Neighbor heuristiği - Başlangıç noktasından (indeks 0) başla
 */
function nearestNeighbor(n: number, distMatrix: number[][]): number[] {
  const visited = new Set<number>()
  const route: number[] = [0]
  visited.add(0)

  while (visited.size < n) {
    const current = route[route.length - 1]
    let nearestIdx = -1
    let nearestDist = Infinity

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue
      if (distMatrix[current][i] < nearestDist) {
        nearestDist = distMatrix[current][i]
        nearestIdx = i
      }
    }

    if (nearestIdx === -1) break
    route.push(nearestIdx)
    visited.add(nearestIdx)
  }

  return route
}

/**
 * 2-opt yerel arama iyileştirmesi
 *
 * Rotadaki iki kenarı çaprazlayarak toplam mesafeyi azaltmaya çalışır.
 */
function twoOpt(route: number[], distMatrix: number[][]): number[] {
  const n = route.length
  let improved = true

  while (improved) {
    improved = false

    for (let i = 1; i < n - 1; i++) {
      // j < n olmalı (açık tur için son düğümü de test et)
      for (let j = i + 1; j < n; j++) {
        const delta = twoOptDelta(route, distMatrix, i, j)

        if (delta < -1e-10) {
          // i ile j arasındaki segmenti ters çevir
          reverse(route, i, j)
          improved = true
        }
      }
    }
  }

  return route
}

/**
 * 2-opt swap'ın mesafe değişimini hesapla (tam swap yapmadan)
 * Açık tur (open tour) için: Son düğümden başlangıca dönüş yok
 */
function twoOptDelta(
  route: number[],
  distMatrix: number[][],
  i: number,
  j: number
): number {
  const a = route[i - 1]
  const b = route[i]
  const c = route[j]

  // Açık tur: j son düğümse, d yok (başlangıca dönüş yok)
  if (j + 1 >= route.length) {
    // Son segment için: sadece a→b kenarını a→c ile karşılaştır
    // Eski: ... → a → b → ... → c (son)
    // Yeni: ... → a → c → ... → b (son)
    const oldDist = distMatrix[a][b]
    const newDist = distMatrix[a][c]
    return newDist - oldDist
  }

  const d = route[j + 1]
  const oldDist = distMatrix[a][b] + distMatrix[c][d]
  const newDist = distMatrix[a][c] + distMatrix[b][d]

  return newDist - oldDist
}

/**
 * Dizi segmentini yerinde ters çevir
 */
function reverse(arr: number[], from: number, to: number): void {
  let left = from
  let right = to
  while (left < right) {
    const tmp = arr[left]
    arr[left] = arr[right]
    arr[right] = tmp
    left++
    right--
  }
}

/**
 * Rota toplam mesafesini hesapla
 */
function calculateRouteDistance(route: number[], distMatrix: number[][]): number {
  let total = 0
  for (let i = 0; i < route.length - 1; i++) {
    total += distMatrix[route[i]][route[i + 1]]
  }
  return Math.round(total * 100) / 100
}

/**
 * Tahmini süre hesapla
 *
 * Ortalama hız: 25 km/h (Istanbul trafiği)
 * Ziyaret süresi: 30 dk/durak
 */
function estimateDuration(totalDistanceKm: number, stopCount: number): number {
  const drivingMinutes = (totalDistanceKm / 25) * 60
  const visitMinutes = stopCount * ROUTE_DEFAULTS.AVERAGE_VISIT_DURATION_MIN
  return Math.round(drivingMinutes + visitMinutes)
}
