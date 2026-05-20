import { describe, it, expect } from 'vitest'
import { haversineDistance, urbanDistance, getBoundingBox, isPointInBBox, getCentroid } from '@/lib/geo-utils'
import type { GeoPoint } from '@/types/geo'

describe('haversineDistance — input validation', () => {
  it('NaN koordinata ValidationError fırlatır', () => {
    expect(() => haversineDistance({ lat: NaN, lng: 0 }, { lat: 41, lng: 29 })).toThrow()
  })

  it('Infinity koordinata ValidationError fırlatır', () => {
    expect(() => haversineDistance({ lat: 41, lng: Infinity }, { lat: 41, lng: 29 })).toThrow()
  })

  it('sınır dışı latitüde ValidationError fırlatır', () => {
    expect(() => haversineDistance({ lat: 100, lng: 29 }, { lat: 41, lng: 29 })).toThrow()
  })

  it('sınır dışı longitüde ValidationError fırlatır', () => {
    expect(() => haversineDistance({ lat: 41, lng: -200 }, { lat: 41, lng: 29 })).toThrow()
  })
})

describe('haversineDistance', () => {
  it('aynı nokta için 0 döner', () => {
    const p = { lat: 41.0082, lng: 28.9784 }
    expect(haversineDistance(p, p)).toBe(0)
  })

  it('Kadıköy-Beşiktaş arası ~6 km', () => {
    const kadikoy = { lat: 40.9927, lng: 29.0287 }
    const besiktas = { lat: 41.0422, lng: 29.0053 }
    const dist = haversineDistance(kadikoy, besiktas)

    expect(dist).toBeGreaterThan(5)
    expect(dist).toBeLessThan(7)
  })

  it('Istanbul-Ankara arası ~350 km', () => {
    const istanbul = { lat: 41.0082, lng: 28.9784 }
    const ankara = { lat: 39.9334, lng: 32.8597 }
    const dist = haversineDistance(istanbul, ankara)

    expect(dist).toBeGreaterThan(340)
    expect(dist).toBeLessThan(360)
  })
})

describe('urbanDistance', () => {
  it('haversine * 1.3 varsayılan faktör uygular', () => {
    const a = { lat: 41.0, lng: 29.0 }
    const b = { lat: 41.01, lng: 29.01 }

    const haversine = haversineDistance(a, b)
    const urban = urbanDistance(a, b)

    expect(urban).toBeCloseTo(haversine * 1.3, 5)
  })

  it('özel faktör çalışır', () => {
    const a = { lat: 41.0, lng: 29.0 }
    const b = { lat: 41.01, lng: 29.01 }

    const haversine = haversineDistance(a, b)
    const urban = urbanDistance(a, b, 2.0)

    expect(urban).toBeCloseTo(haversine * 2.0, 5)
  })
})

describe('getBoundingBox', () => {
  it('boş liste için sıfır bbox döner', () => {
    const bbox = getBoundingBox([])
    expect(bbox).toEqual({ minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 })
  })

  it('doğru bbox hesaplar', () => {
    const points: GeoPoint[] = [
      { lat: 40.0, lng: 28.0 },
      { lat: 41.0, lng: 29.0 },
      { lat: 40.5, lng: 28.5 },
    ]

    const bbox = getBoundingBox(points)

    expect(bbox.minLat).toBe(40.0)
    expect(bbox.maxLat).toBe(41.0)
    expect(bbox.minLng).toBe(28.0)
    expect(bbox.maxLng).toBe(29.0)
  })
})

describe('isPointInBBox', () => {
  const bbox = { minLat: 40.0, maxLat: 41.0, minLng: 28.0, maxLng: 29.0 }

  it('bbox içindeki noktayı doğru tespit eder', () => {
    expect(isPointInBBox({ lat: 40.5, lng: 28.5 }, bbox)).toBe(true)
  })

  it('bbox dışındaki noktayı doğru tespit eder', () => {
    expect(isPointInBBox({ lat: 42.0, lng: 30.0 }, bbox)).toBe(false)
  })

  it('bbox sınırındaki noktayı içeride sayar', () => {
    expect(isPointInBBox({ lat: 40.0, lng: 28.0 }, bbox)).toBe(true)
    expect(isPointInBBox({ lat: 41.0, lng: 29.0 }, bbox)).toBe(true)
  })
})

describe('getCentroid', () => {
  it('boş liste için (0,0) döner', () => {
    expect(getCentroid([])).toEqual({ lat: 0, lng: 0 })
  })

  it('tek nokta için aynı noktayı döner', () => {
    const p = { lat: 41.0, lng: 29.0 }
    expect(getCentroid([p])).toEqual(p)
  })

  it('iki noktanın ortasını hesaplar', () => {
    const points: GeoPoint[] = [
      { lat: 40.0, lng: 28.0 },
      { lat: 42.0, lng: 30.0 },
    ]
    const c = getCentroid(points)

    expect(c.lat).toBeCloseTo(41.0, 5)
    expect(c.lng).toBeCloseTo(29.0, 5)
  })
})
