/**
 * Haftalık dağıtım algoritması
 *
 * Saf iş mantığı (I/O yok) — tüm veri parametre olarak gelir.
 * FIELD ajanlarına rota (TSP optimize) — haftanın 5 günü saha ziyareti.
 * TELESALES ajanlarına arama listesi — haftanın 5 günü telefon araması.
 * FIELD ajanlar telefon araması YAPMAZ.
 * Çapraz deduplikasyon: Bir lead sadece tek bir yerde bulunur.
 * Round-robin: Lead'ler ajanlar arasında adil dağıtılır.
 * İki geçişli dağıtım: Önce tercih eşleşen lead'ler, sonra kalan slotlar için tercih gözetmeden dağıtım.
 */

import type { GeoPoint } from '@/types/geo'
import type { RouteStop } from '@/types/database'
import type { CallListItem } from '@/types/call'
import type { DayType } from '@/types/schedule'
import { optimizeRoute } from '@/core/routing/route-optimizer'
import { generateCallList } from '@/core/routing/call-list-generator'
import { ISTANBUL_CENTER, DAILY_CALL_TARGET } from '@/lib/constants'

// ——— Giriş Tipleri ———

export interface WeeklyDistributionInput {
  agents: AgentForDistribution[]
  leads: LeadForDistribution[]
  weekDays: Array<{ date: string; type: DayType }>
}

export interface AgentForDistribution {
  id: string
  role: 'FIELD_AGENT' | 'TELESALES_AGENT' | 'ADMIN'
  baseLat: number | null
  baseLng: number | null
  maxDailyVisits: number
  districtIds: string[]
  categories: string[]
}

export interface LeadForDistribution {
  id: string
  districtId: string | null
  category: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  needScore: number
  businessName: string
}

// ——— Çıkış Tipleri ———

export interface WeeklyDistributionResult {
  routes: DistributedRoute[]
  callLists: DistributedCallList[]
  stats: DistributionStats
}

export interface DistributedRoute {
  agentId: string
  routeDate: string
  stops: RouteStop[]
  totalDistanceKm: number
  estimatedDurationMin: number
}

export interface DistributedCallList {
  agentId: string
  listDate: string
  items: CallListItem[]
}

export interface DistributionStats {
  totalFieldLeads: number
  totalCallLeads: number
  unassignedLeads: number
  perAgent: Array<{
    agentId: string
    routeCount: number
    callCount: number
  }>
}

// ——— Ana Fonksiyon ———

export function distributeWeeklyPlan(input: WeeklyDistributionInput): WeeklyDistributionResult {
  const { agents, leads, weekDays } = input
  const usedLeadIds = new Set<string>()
  const routes: DistributedRoute[] = []
  const callLists: DistributedCallList[] = []
  const perAgentMap = new Map<string, { routeCount: number; callCount: number }>()

  // Ajan istatistik haritasını başlat
  for (const agent of agents) {
    perAgentMap.set(agent.id, { routeCount: 0, callCount: 0 })
  }

  const fieldDays = weekDays.filter((d) => d.type === 'FIELD')
  const fieldAgents = agents.filter((a) => a.role === 'FIELD_AGENT')

  // Lead'leri needScore'a göre azalan sırala (en yüksek önce)
  const sortedLeads = [...leads].sort((a, b) => b.needScore - a.needScore)

  // ——— FIELD Dağıtım (Pzt-Cum) — Round-robin ile adil dağıtım ———
  if (fieldAgents.length > 0 && fieldDays.length > 0) {
    const fieldBuckets = new Map<string, LeadForDistribution[]>()
    const fieldSlots = new Map<string, number>()
    for (const agent of fieldAgents) {
      fieldBuckets.set(agent.id, [])
      fieldSlots.set(agent.id, fieldDays.length * agent.maxDailyVisits)
    }

    // Pass 1: Tercih eşleşen lead'leri dağıt
    let agentIdx = 0
    for (const lead of sortedLeads) {
      if (usedLeadIds.has(lead.id) || lead.lat === null || lead.lng === null) continue
      const hasCapacity = fieldAgents.some(
        (a) => fieldBuckets.get(a.id)!.length < fieldSlots.get(a.id)!
      )
      if (!hasCapacity) break
      let assigned = false
      for (let attempt = 0; attempt < fieldAgents.length; attempt++) {
        const agent = fieldAgents[agentIdx % fieldAgents.length]
        agentIdx++
        const bucket = fieldBuckets.get(agent.id)!
        if (bucket.length >= fieldSlots.get(agent.id)!) continue
        if (!matchesPreferences(lead, agent)) continue
        bucket.push(lead)
        usedLeadIds.add(lead.id)
        assigned = true
        break
      }
      if (!assigned) continue
    }

    // Pass 2: Slotları dolmamış TÜM ajanlar için tercih gözetmeden dağıt
    // Tercihli ajanlar da kalan kapasitelerini doldurabilir
    for (const lead of sortedLeads) {
      if (usedLeadIds.has(lead.id) || lead.lat === null || lead.lng === null) continue
      const hasCapacity = fieldAgents.some(
        (a) => fieldBuckets.get(a.id)!.length < fieldSlots.get(a.id)!
      )
      if (!hasCapacity) break
      let assigned = false
      for (let attempt = 0; attempt < fieldAgents.length; attempt++) {
        const agent = fieldAgents[agentIdx % fieldAgents.length]
        agentIdx++
        const bucket = fieldBuckets.get(agent.id)!
        if (bucket.length >= fieldSlots.get(agent.id)!) continue
        bucket.push(lead)
        usedLeadIds.add(lead.id)
        assigned = true
        break
      }
      if (!assigned) continue
    }

    // Her ajan için günlere böl ve rota oluştur
    for (const agent of fieldAgents) {
      const assigned = fieldBuckets.get(agent.id)!
      if (assigned.length === 0) continue
      const perDay = splitEvenly(assigned, fieldDays.length)

      for (let i = 0; i < fieldDays.length; i++) {
        const dayLeads = perDay[i]
        if (dayLeads.length === 0) continue

        const startPoint: GeoPoint = {
          lat: agent.baseLat ?? ISTANBUL_CENTER.lat,
          lng: agent.baseLng ?? ISTANBUL_CENTER.lng,
        }

        const stops: GeoPoint[] = dayLeads.map((l) => ({
          lat: l.lat!,
          lng: l.lng!,
          id: l.id,
          label: l.businessName,
        }))

        const optimized = optimizeRoute(stops, startPoint)

        const routeStops: RouteStop[] = optimized.orderedStops.map((point, idx) => {
          const lead = dayLeads.find((l) => l.id === point.id)
          return {
            lead_id: point.id!,
            order: idx + 1,
            lat: point.lat,
            lng: point.lng,
            status: 'PENDING',
            business_name: lead?.businessName,
            phone: lead?.phone ?? undefined,
          }
        })

        routes.push({
          agentId: agent.id,
          routeDate: fieldDays[i].date,
          stops: routeStops,
          totalDistanceKm: optimized.totalDistanceKm,
          estimatedDurationMin: optimized.estimatedDurationMin,
        })

        const stats = perAgentMap.get(agent.id)!
        stats.routeCount += dayLeads.length
      }
    }
  }

  // ——— CALL Dağıtım — Sadece TELESALES ajanlarına tüm hafta içi ———
  // TELESALES ajanları haftanın 5 günü (OFF hariç) arama yapar, FIELD ajanlar arama YAPMAZ
  const telesalesDays = weekDays.filter((d) => d.type !== 'OFF')
  const telesalesAgents = agents.filter((a) => a.role === 'TELESALES_AGENT')

  // Her iki grup için ortak dağıtım helper'ı
  function distributeCallsToGroup(
    groupAgents: AgentForDistribution[],
    days: Array<{ date: string; type: DayType }>,
    dailyCallLimit?: number,
  ) {
    if (groupAgents.length === 0 || days.length === 0) return

    const callBuckets = new Map<string, LeadForDistribution[]>()
    const callSlots = new Map<string, number>()
    for (const agent of groupAgents) {
      const perDay = dailyCallLimit ?? agent.maxDailyVisits
      callBuckets.set(agent.id, [])
      callSlots.set(agent.id, days.length * perDay)
    }

    // Pass 1: Tercih eşleşen lead'leri dağıt
    let agentIdx = 0
    for (const lead of sortedLeads) {
      if (usedLeadIds.has(lead.id) || lead.phone === null) continue
      const hasCapacity = groupAgents.some(
        (a) => callBuckets.get(a.id)!.length < callSlots.get(a.id)!
      )
      if (!hasCapacity) break
      let assigned = false
      for (let attempt = 0; attempt < groupAgents.length; attempt++) {
        const agent = groupAgents[agentIdx % groupAgents.length]
        agentIdx++
        const bucket = callBuckets.get(agent.id)!
        if (bucket.length >= callSlots.get(agent.id)!) continue
        if (!matchesPreferences(lead, agent)) continue
        bucket.push(lead)
        usedLeadIds.add(lead.id)
        assigned = true
        break
      }
      if (!assigned) continue
    }

    // Pass 2: Slotları dolmamış TÜM ajanlar için tercih gözetmeden dağıt
    // Tercihli ajanlar da kalan kapasitelerini doldurabilir
    for (const lead of sortedLeads) {
      if (usedLeadIds.has(lead.id) || lead.phone === null) continue
      const hasCapacity = groupAgents.some(
        (a) => callBuckets.get(a.id)!.length < callSlots.get(a.id)!
      )
      if (!hasCapacity) break
      let assigned = false
      for (let attempt = 0; attempt < groupAgents.length; attempt++) {
        const agent = groupAgents[agentIdx % groupAgents.length]
        agentIdx++
        const bucket = callBuckets.get(agent.id)!
        if (bucket.length >= callSlots.get(agent.id)!) continue
        bucket.push(lead)
        usedLeadIds.add(lead.id)
        assigned = true
        break
      }
      if (!assigned) continue
    }

    // Her ajan için günlere böl ve arama listesi oluştur
    for (const agent of groupAgents) {
      const assigned = callBuckets.get(agent.id)!
      if (assigned.length === 0) continue
      const perDay = splitEvenly(assigned, days.length)

      for (let i = 0; i < days.length; i++) {
        const dayLeads = perDay[i]
        if (dayLeads.length === 0) continue

        const dailyMax = dailyCallLimit ?? agent.maxDailyVisits
        const items = generateCallList(
          dayLeads.map((l) => ({
            id: l.id,
            businessName: l.businessName,
            phone: l.phone,
            needScore: l.needScore,
          })),
          { maxItems: dailyMax, minScore: 0 }
        )

        callLists.push({
          agentId: agent.id,
          listDate: days[i].date,
          items,
        })

        const stats = perAgentMap.get(agent.id)!
        stats.callCount += dayLeads.length
      }
    }
  }

  // TELESALES ajanlarına tüm hafta içi günler (Pzt-Cum) üzerinden arama listesi — günde 20
  distributeCallsToGroup(telesalesAgents, telesalesDays, DAILY_CALL_TARGET)

  // İstatistik hesapla
  let totalFieldLeads = 0
  let totalCallLeads = 0
  for (const [, stats] of perAgentMap) {
    totalFieldLeads += stats.routeCount
    totalCallLeads += stats.callCount
  }

  return {
    routes,
    callLists,
    stats: {
      totalFieldLeads,
      totalCallLeads,
      unassignedLeads: leads.length - usedLeadIds.size,
      perAgent: Array.from(perAgentMap.entries()).map(([agentId, stats]) => ({
        agentId,
        ...stats,
      })),
    },
  }
}

// ——— Yardımcı Fonksiyonlar ———

/**
 * Lead'in ajanın tercihlerine uyup uymadığını kontrol et.
 * Ajan tercih belirtmemişse tüm lead'ler uygun sayılır.
 */
function matchesPreferences(lead: LeadForDistribution, agent: AgentForDistribution): boolean {
  const districtMatch =
    agent.districtIds.length === 0 ||
    (lead.districtId !== null && agent.districtIds.includes(lead.districtId))

  const categoryMatch =
    agent.categories.length === 0 ||
    (lead.category !== null &&
      agent.categories.some((c) =>
        lead.category!.toLowerCase() === c.toLowerCase()
      ))

  return districtMatch && categoryMatch
}

/**
 * Diziyi n parçaya eşit böl
 */
function splitEvenly<T>(items: T[], n: number): T[][] {
  if (n <= 0) return []
  const result: T[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < items.length; i++) {
    result[i % n].push(items[i])
  }
  return result
}
