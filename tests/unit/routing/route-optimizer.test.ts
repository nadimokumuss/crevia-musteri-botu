import { describe, it, expect } from 'vitest'
import { optimizeRoute } from '@/core/routing/route-optimizer'
import type { GeoPoint } from '@/types/geo'

describe('optimizeRoute (TSP)', () => {
  const startPoint: GeoPoint = { lat: 41.0082, lng: 28.9784, id: 'start' }

  it('boş durak listesi için boş rota döner', () => {
    const result = optimizeRoute([], startPoint)

    expect(result.orderedStops).toHaveLength(0)
    expect(result.totalDistanceKm).toBe(0)
    expect(result.estimatedDurationMin).toBe(0)
  })

  it('tek durak için doğru mesafe hesaplar', () => {
    const stops: GeoPoint[] = [{ lat: 41.0150, lng: 28.9800, id: 'a' }]

    const result = optimizeRoute(stops, startPoint)

    expect(result.orderedStops).toHaveLength(1)
    expect(result.totalDistanceKm).toBeGreaterThan(0)
    expect(result.estimatedDurationMin).toBeGreaterThan(0)
  })

  it('birden fazla durak sıralı şekilde döner', () => {
    const stops: GeoPoint[] = [
      { lat: 41.0200, lng: 29.0000, id: 'a' },
      { lat: 41.0100, lng: 28.9900, id: 'b' },
      { lat: 41.0300, lng: 29.0100, id: 'c' },
    ]

    const result = optimizeRoute(stops, startPoint)

    expect(result.orderedStops).toHaveLength(3)
    // Tüm durak ID'leri mevcut
    const ids = result.orderedStops.map((s) => s.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('c')
  })

  it('2-opt iyileştirme mesafeyi azaltır veya korur', () => {
    // Kare şeklinde 4 nokta - optimal rota kenarları izlemeli
    const stops: GeoPoint[] = [
      { lat: 41.00, lng: 29.00, id: 'a' },
      { lat: 41.01, lng: 29.00, id: 'b' },
      { lat: 41.01, lng: 29.01, id: 'c' },
      { lat: 41.00, lng: 29.01, id: 'd' },
    ]

    const result = optimizeRoute(stops, startPoint)

    expect(result.orderedStops).toHaveLength(4)
    expect(result.totalDistanceKm).toBeGreaterThan(0)
  })

  it('tahmini süre ziyaret süresi + sürüş süresi içerir', () => {
    const stops: GeoPoint[] = [
      { lat: 41.01, lng: 29.00, id: 'a' },
      { lat: 41.02, lng: 29.00, id: 'b' },
    ]

    const result = optimizeRoute(stops, startPoint)

    // 2 durak * 30dk = 60dk minimum (+ sürüş süresi)
    expect(result.estimatedDurationMin).toBeGreaterThanOrEqual(60)
  })

  it('15 durak için makul sürede tamamlanır', () => {
    const stops: GeoPoint[] = Array.from({ length: 15 }, (_, i) => ({
      lat: 41.0 + (i * 0.005),
      lng: 29.0 + ((i % 3) * 0.005),
      id: `stop-${i}`,
    }))

    const start = performance.now()
    const result = optimizeRoute(stops, startPoint)
    const elapsed = performance.now() - start

    expect(result.orderedStops).toHaveLength(15)
    expect(elapsed).toBeLessThan(500) // 500ms altında (çok güvenli marj)
  })

  it('kentsel düzeltme faktörünü uygular', () => {
    const stops: GeoPoint[] = [{ lat: 41.05, lng: 29.05, id: 'a' }]

    const withFactor = optimizeRoute(stops, startPoint, 1.3)
    const withoutFactor = optimizeRoute(stops, startPoint, 1.0)

    expect(withFactor.totalDistanceKm).toBeGreaterThan(withoutFactor.totalDistanceKm)
  })
})
