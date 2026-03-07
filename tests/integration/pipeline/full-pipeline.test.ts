/**
 * Tam pipeline entegrasyon testi
 *
 * Kazıma -> Puanlama -> Kümeleme -> Rota Optimizasyonu -> Arama Listesi -> Dağıtım
 *
 * Veritabanı bağımlılığı yok - tüm core fonksiyonları saf fonksiyon olarak test eder.
 */

import { describe, it, expect } from 'vitest'
import { calculateNeedScore } from '@/core/scoring/need-score'
import { clusterLeads } from '@/core/routing/geo-cluster'
import { optimizeRoute } from '@/core/routing/route-optimizer'
import { generateCallList } from '@/core/routing/call-list-generator'
import { distributeLeads } from '@/core/assignment/distributor'
import { getDayType, isFieldDay, isRemoteDay } from '@/core/scheduler/weekly-planner'
import type { LeadScoreInput } from '@/types/scoring'
import type { GeoPoint } from '@/types/geo'

// Simüle edilmiş lead verileri (scraper çıktısı)
const MOCK_SCRAPED_LEADS = [
  {
    id: 'lead-1',
    businessName: 'Kafe Minimal',
    lat: 40.9900,
    lng: 29.0280,
    phone: '555-0001',
    google: { isClaimed: false, photoCount: 0, rating: null, reviewCount: 3, lastUpdated: null, hasWebsite: false, hasPhone: true, responseRate: null },
    instagram: null,
    website: null,
    marketing: null,
  },
  {
    id: 'lead-2',
    businessName: 'Restoran Lezzet',
    lat: 40.9905,
    lng: 29.0285,
    phone: '555-0002',
    google: { isClaimed: true, photoCount: 20, rating: 4.5, reviewCount: 120, lastUpdated: new Date(), hasWebsite: true, hasPhone: true, responseRate: 0.5 },
    instagram: { exists: true as const, lastPostDate: new Date(), avgLikes: 200, postCount: 100, hasHighlights: true, bioContainsAgency: false, hasBioLink: true, followerCount: 5000, postingRegularity: 'regular' as const, engagementRate: 4, reelsRatio: 0.3 },
    website: { exists: true, speedScore: 85, isMobileFriendly: true, has404s: false },
    marketing: { hasMetaPixel: true, hasGA4: true, hasActiveMetaAds: true, hasActiveGoogleAds: true },
  },
  {
    id: 'lead-3',
    businessName: 'Güzellik Salonu Ela',
    lat: 40.9902,
    lng: 29.0282,
    phone: null,
    google: null,
    instagram: null,
    website: null,
    marketing: null,
  },
  {
    id: 'lead-4',
    businessName: 'Otel Boğaz',
    lat: 41.0422,
    lng: 29.0050,
    phone: '555-0004',
    google: { isClaimed: false, photoCount: 2, rating: 3.0, reviewCount: 8, lastUpdated: new Date(2024, 0, 1), hasWebsite: false, hasPhone: true, responseRate: 0 },
    instagram: { exists: true as const, lastPostDate: new Date(2024, 6, 1), avgLikes: 5, postCount: 12, hasHighlights: false, bioContainsAgency: false, hasBioLink: false, followerCount: 200, postingRegularity: 'gaps' as const, engagementRate: 2.5, reelsRatio: 0 },
    website: null,
    marketing: null,
  },
  {
    id: 'lead-5',
    businessName: 'Spor Salonu Fit',
    lat: 41.0424,
    lng: 29.0052,
    phone: '555-0005',
    google: { isClaimed: true, photoCount: 8, rating: 4.0, reviewCount: 50, lastUpdated: new Date(), hasWebsite: true, hasPhone: true, responseRate: 0.3 },
    instagram: { exists: true as const, lastPostDate: new Date(), avgLikes: 50, postCount: 80, hasHighlights: true, bioContainsAgency: true, hasBioLink: true, followerCount: 3000, postingRegularity: 'regular' as const, engagementRate: 1.7, reelsRatio: 0.2 },
    website: { exists: true, speedScore: 70, isMobileFriendly: true, has404s: false },
    marketing: { hasMetaPixel: false, hasGA4: false, hasActiveMetaAds: null, hasActiveGoogleAds: null },
  },
  {
    id: 'lead-6',
    businessName: 'Klinik Sağlık',
    lat: 41.0426,
    lng: 29.0054,
    phone: '555-0006',
    google: { isClaimed: true, photoCount: 3, rating: 3.2, reviewCount: 5, lastUpdated: null, hasWebsite: false, hasPhone: true, responseRate: null },
    instagram: null,
    website: null,
    marketing: null,
  },
]

describe('Full Pipeline: Scraping -> Scoring -> Clustering -> Routing -> Assignment', () => {
  // ADIM 1: Puanlama
  it('Adım 1: Tüm lead\'leri puanlar', () => {
    const scores = MOCK_SCRAPED_LEADS.map((lead) => {
      const input: LeadScoreInput = {
        google: lead.google,
        instagram: lead.instagram,
        website: lead.website,
        marketing: lead.marketing,
      }
      const result = calculateNeedScore(input)
      return { ...lead, score: result.totalScore, recommendation: result.recommendation }
    })

    // lead-1: Google kötü + Instagram yok + Website yok + Marketing yok = yüksek puan
    expect(scores[0].score).toBeGreaterThanOrEqual(40)

    // lead-2: Her şey mükemmel = 0 puan
    expect(scores[1].score).toBe(0)
    expect(scores[1].recommendation).toBe('SKIP')

    // lead-3: Her şey yok = yüksek puan (15+15+15+10=55)
    expect(scores[2].score).toBe(55)

    // lead-5: Ajans tespit -> Instagram puanı düşer
    expect(scores[4].score).toBeLessThan(scores[3].score)

    // Tüm puanlar 0-100 arasında
    scores.forEach((s) => {
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(100)
    })
  })

  // ADIM 2: Kümeleme
  it('Adım 2: Lead\'leri coğrafi olarak kümeler', () => {
    const points: GeoPoint[] = MOCK_SCRAPED_LEADS.map((l) => ({
      lat: l.lat,
      lng: l.lng,
      id: l.id,
    }))

    const clusters = clusterLeads(points, 500, 3)

    // En az 1 küme veya gürültü grubu olmalı
    expect(clusters.length).toBeGreaterThan(0)

    // Tüm noktalar bir kümede veya gürültüde olmalı
    const allPoints = clusters.flatMap((c) => c.points)
    expect(allPoints).toHaveLength(MOCK_SCRAPED_LEADS.length)
  })

  // ADIM 3: Rota Optimizasyonu (Saha günü)
  it('Adım 3: Saha günü için optimize rota oluşturur', () => {
    const startPoint: GeoPoint = { lat: 41.0082, lng: 28.9784 }

    // Sadece yüksek puanlı lead'ler için rota
    const fieldLeads: GeoPoint[] = MOCK_SCRAPED_LEADS
      .slice(0, 4)
      .map((l) => ({ lat: l.lat, lng: l.lng, id: l.id }))

    const route = optimizeRoute(fieldLeads, startPoint)

    expect(route.orderedStops).toHaveLength(4)
    expect(route.totalDistanceKm).toBeGreaterThan(0)
    expect(route.estimatedDurationMin).toBeGreaterThan(0)

    // Tüm durak ID'leri mevcut
    const routeIds = route.orderedStops.map((s) => s.id)
    expect(routeIds).toContain('lead-1')
    expect(routeIds).toContain('lead-2')
    expect(routeIds).toContain('lead-3')
    expect(routeIds).toContain('lead-4')
  })

  // ADIM 4: Arama Listesi (Telefon günü)
  it('Adım 4: Telefon günü için arama listesi oluşturur', () => {
    // Puanları hesapla
    const scoredLeads = MOCK_SCRAPED_LEADS.map((lead) => {
      const result = calculateNeedScore({ google: lead.google, instagram: lead.instagram, website: lead.website, marketing: lead.marketing })
      return {
        id: lead.id,
        businessName: lead.businessName,
        phone: lead.phone,
        needScore: result.totalScore,
      }
    })

    const callList = generateCallList(scoredLeads, { maxItems: 5, minScore: 15 })

    // Düşük puanlılar filtrelenmeli
    expect(callList.every((item) => item.needScore >= 15)).toBe(true)

    // Need score'a göre azalan sıralı olmalı
    for (let i = 0; i < callList.length - 1; i++) {
      expect(callList[i].needScore).toBeGreaterThanOrEqual(callList[i + 1].needScore)
    }

    // Tümü PENDING
    expect(callList.every((item) => item.status === 'PENDING')).toBe(true)
  })

  // ADIM 5: Dağıtım
  it('Adım 5: Lead\'leri ajanlara round-robin dağıtır', () => {
    const leadIds = MOCK_SCRAPED_LEADS.map((l) => l.id)

    const result = distributeLeads({
      leadIds,
      agents: [
        { agentId: 'agent-a', maxDaily: 3, currentLoad: 0 },
        { agentId: 'agent-b', maxDaily: 3, currentLoad: 0 },
        { agentId: 'agent-c', maxDaily: 3, currentLoad: 0 },
      ],
      assignmentType: 'VISIT',
    })

    // 6 lead / 3 ajan = her ajana 2
    expect(result.assignments.get('agent-a')).toHaveLength(2)
    expect(result.assignments.get('agent-b')).toHaveLength(2)
    expect(result.assignments.get('agent-c')).toHaveLength(2)
    expect(result.unassigned).toHaveLength(0)

    // Hiçbir lead mükerrer atanmamış
    const allAssigned = [...result.assignments.values()].flat()
    const uniqueAssigned = new Set(allAssigned)
    expect(uniqueAssigned.size).toBe(allAssigned.length)
  })

  // ADIM 6: Haftalık planlayıcı entegrasyonu
  it('Adım 6: Gün tipi doğru belirlenir ve akışa yön verir', () => {
    // Pazartesi = REMOTE -> arama listesi
    const monday = new Date(2026, 1, 16)
    expect(getDayType(monday)).toBe('REMOTE')
    expect(isRemoteDay(monday)).toBe(true)

    // Salı = FIELD -> rota optimizasyonu
    const tuesday = new Date(2026, 1, 17)
    expect(getDayType(tuesday)).toBe('FIELD')
    expect(isFieldDay(tuesday)).toBe(true)

    // Cuma = ADMIN -> idari (dağıtım yapılır)
    const friday = new Date(2026, 1, 20)
    expect(getDayType(friday)).toBe('ADMIN')
  })

  // TAM PIPELINE: Uçtan uca
  it('Tam pipeline: Puanlama -> Filtreleme -> Kümeleme -> Rota -> Dağıtım', () => {
    // 1. Puanla
    const scored = MOCK_SCRAPED_LEADS.map((lead) => {
      const result = calculateNeedScore({ google: lead.google, instagram: lead.instagram, website: lead.website, marketing: lead.marketing })
      return { ...lead, needScore: result.totalScore, recommendation: result.recommendation }
    })

    // 2. Filtrele (SKIP olmayanlar)
    const eligible = scored.filter((l) => l.recommendation !== 'SKIP')
    expect(eligible.length).toBeLessThan(scored.length)
    expect(eligible.length).toBeGreaterThan(0)

    // 3. Kümele
    const points: GeoPoint[] = eligible.map((l) => ({ lat: l.lat, lng: l.lng, id: l.id }))
    const clusters = clusterLeads(points, 500, 2)
    expect(clusters.length).toBeGreaterThan(0)

    // 4. Her küme için rota oluştur
    const startPoint: GeoPoint = { lat: 41.0082, lng: 28.9784 }
    const realClusters = clusters.filter((c) => !c.isNoise)

    const routes = realClusters.map((cluster) => {
      return optimizeRoute(cluster.points, startPoint)
    })

    // Her rota geçerli
    routes.forEach((route) => {
      expect(route.orderedStops.length).toBeGreaterThan(0)
      expect(route.totalDistanceKm).toBeGreaterThanOrEqual(0)
    })

    // 5. Dağıt
    const allLeadIds = eligible.map((l) => l.id)
    const distribution = distributeLeads({
      leadIds: allLeadIds,
      agents: [
        { agentId: 'saha-1', maxDaily: 10, currentLoad: 0 },
        { agentId: 'saha-2', maxDaily: 10, currentLoad: 0 },
      ],
      assignmentType: 'VISIT',
    })

    const totalAssigned = [...distribution.assignments.values()].flat().length
    expect(totalAssigned + distribution.unassigned.length).toBe(eligible.length)
  })
})
