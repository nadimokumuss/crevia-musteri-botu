import { describe, it, expect } from 'vitest'
import { clusterLeads } from '@/core/routing/geo-cluster'
import type { GeoPoint } from '@/types/geo'

describe('clusterLeads (DBSCAN)', () => {
  it('boş nokta listesi için boş küme döner', () => {
    expect(clusterLeads([])).toEqual([])
  })

  it('yakın noktaları aynı kümeye atar', () => {
    // Kadıköy bölgesinde çok yakın 4 nokta (~100m arası)
    const points: GeoPoint[] = [
      { lat: 40.9900, lng: 29.0280, id: 'a' },
      { lat: 40.9905, lng: 29.0285, id: 'b' },
      { lat: 40.9902, lng: 29.0282, id: 'c' },
      { lat: 40.9903, lng: 29.0288, id: 'd' },
    ]

    const clusters = clusterLeads(points, 500, 3)
    const realClusters = clusters.filter((c) => !c.isNoise)

    expect(realClusters).toHaveLength(1)
    expect(realClusters[0].points).toHaveLength(4)
  })

  it('uzak noktaları gürültü olarak işaretler', () => {
    // 2 yakın nokta + 1 çok uzak nokta -> 2 nokta minPoints=3'ü karşılamaz
    const points: GeoPoint[] = [
      { lat: 40.9900, lng: 29.0280, id: 'a' },
      { lat: 40.9901, lng: 29.0281, id: 'b' },
      { lat: 41.1000, lng: 29.1000, id: 'far' }, // ~15 km uzakta
    ]

    const clusters = clusterLeads(points, 500, 3)
    const noiseClusters = clusters.filter((c) => c.isNoise)

    // Hepsi gürültü çünkü 3 yakın nokta yok
    expect(noiseClusters).toHaveLength(1)
    expect(noiseClusters[0].points).toHaveLength(3)
  })

  it('birden fazla küme oluşturur', () => {
    const points: GeoPoint[] = [
      // Küme 1: Kadıköy
      { lat: 40.9900, lng: 29.0280, id: 'k1' },
      { lat: 40.9902, lng: 29.0282, id: 'k2' },
      { lat: 40.9904, lng: 29.0284, id: 'k3' },
      // Küme 2: Beşiktaş (~6 km uzakta)
      { lat: 41.0422, lng: 29.0050, id: 'b1' },
      { lat: 41.0424, lng: 29.0052, id: 'b2' },
      { lat: 41.0426, lng: 29.0054, id: 'b3' },
    ]

    const clusters = clusterLeads(points, 500, 3)
    const realClusters = clusters.filter((c) => !c.isNoise)

    expect(realClusters).toHaveLength(2)
    expect(realClusters[0].points).toHaveLength(3)
    expect(realClusters[1].points).toHaveLength(3)
  })

  it('centroid doğru hesaplanır', () => {
    const points: GeoPoint[] = [
      { lat: 40.0, lng: 29.0, id: 'a' },
      { lat: 40.0, lng: 29.0, id: 'b' },
      { lat: 40.0, lng: 29.0, id: 'c' },
    ]

    const clusters = clusterLeads(points, 500, 3)
    const realClusters = clusters.filter((c) => !c.isNoise)

    expect(realClusters).toHaveLength(1)
    expect(realClusters[0].centroid.lat).toBeCloseTo(40.0, 1)
    expect(realClusters[0].centroid.lng).toBeCloseTo(29.0, 1)
  })

  it('özel epsilon ve minPoints parametreleri çalışır', () => {
    const points: GeoPoint[] = [
      { lat: 40.9900, lng: 29.0280, id: 'a' },
      { lat: 40.9905, lng: 29.0285, id: 'b' },
    ]

    // minPoints=2 ile 2 nokta küme oluşturmalı
    const clusters = clusterLeads(points, 1000, 2)
    const realClusters = clusters.filter((c) => !c.isNoise)

    expect(realClusters).toHaveLength(1)
    expect(realClusters[0].points).toHaveLength(2)
  })
})
