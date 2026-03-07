/**
 * Haftalık/Günlük dağıtım algoritması
 *
 * Basit ve güvenilir dağıtım:
 * - FIELD ajanlarına koordinatlı lead'ler (maxDailyVisits kadar)
 * - TELESALES ajanlarına telefonlu lead'ler (DAILY_CALL_TARGET kadar)
 * - Round-robin ile eşit dağıtım
 * - Bir lead sadece bir kez atanır
 */

import type { GeoPoint } from '@/types/geo'
import type { RouteStop } from '@/types/database'
import type { CallListItem } from '@/types/call'
import type { DayType } from '@/types/schedule'
import { optimizeRoute } from '@/core/routing/route-optimizer'
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

  // Lead'leri needScore'a göre azalan sırala
  const sortedLeads = [...leads].sort((a, b) => b.needScore - a.needScore)

  // Koordinatlı lead'leri ayır (FIELD için)
  const leadsWithCoords = sortedLeads.filter(l => l.lat !== null && l.lng !== null)

  // Telefonlu lead'leri ayır (TELESALES için)
  const leadsWithPhone = sortedLeads.filter(l => l.phone !== null)

  // FIELD günleri ve ajanları
  const fieldDays = weekDays.filter((d) => d.type === 'FIELD')
  const fieldAgents = agents.filter((a) => a.role === 'FIELD_AGENT')

  // TELESALES günleri ve ajanları
  const telesalesDays = weekDays.filter((d) => d.type !== 'OFF')
  const telesalesAgents = agents.filter((a) => a.role === 'TELESALES_AGENT')

  // ——— FIELD Dağıtım ———
  if (fieldAgents.length > 0 && fieldDays.length > 0) {
    for (const day of fieldDays) {
      let leadIndex = 0

      for (const agent of fieldAgents) {
        const agentLeads: LeadForDistribution[] = []
        const dailyLimit = agent.maxDailyVisits

        // Bu ajan için günlük limiti doldur
        while (agentLeads.length < dailyLimit && leadIndex < leadsWithCoords.length) {
          const lead = leadsWithCoords[leadIndex]
          leadIndex++

          if (usedLeadIds.has(lead.id)) continue

          agentLeads.push(lead)
          usedLeadIds.add(lead.id)
        }

        if (agentLeads.length === 0) continue

        // Rota oluştur
        const startPoint: GeoPoint = {
          lat: agent.baseLat ?? ISTANBUL_CENTER.lat,
          lng: agent.baseLng ?? ISTANBUL_CENTER.lng,
        }

        const stops: GeoPoint[] = agentLeads.map((l) => ({
          lat: l.lat!,
          lng: l.lng!,
          id: l.id,
          label: l.businessName,
        }))

        const optimized = optimizeRoute(stops, startPoint)

        const routeStops: RouteStop[] = optimized.orderedStops.map((point, idx) => {
          const lead = agentLeads.find((l) => l.id === point.id)
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
          routeDate: day.date,
          stops: routeStops,
          totalDistanceKm: optimized.totalDistanceKm,
          estimatedDurationMin: optimized.estimatedDurationMin,
        })

        const stats = perAgentMap.get(agent.id)!
        stats.routeCount += agentLeads.length
      }
    }
  }

  // ——— TELESALES Dağıtım ———
  // DEBUG: Dağıtım öncesi durum
  console.log('=== TELESALES DAĞITIM DEBUG ===')
  console.log('telesalesAgents:', telesalesAgents.length)
  console.log('telesalesDays:', telesalesDays.length, telesalesDays.map(d => d.date))
  console.log('leadsWithPhone:', leadsWithPhone.length)
  console.log('usedLeadIds (FIELD tarafından):', usedLeadIds.size)
  console.log('DAILY_CALL_TARGET:', DAILY_CALL_TARGET)

  if (telesalesAgents.length > 0 && telesalesDays.length > 0) {
    for (const day of telesalesDays) {
      let leadIndex = 0

      for (const agent of telesalesAgents) {
        const agentLeads: LeadForDistribution[] = []
        const dailyLimit = DAILY_CALL_TARGET
        const startIndex = leadIndex

        // Bu ajan için günlük limiti doldur
        while (agentLeads.length < dailyLimit && leadIndex < leadsWithPhone.length) {
          const lead = leadsWithPhone[leadIndex]
          leadIndex++

          if (usedLeadIds.has(lead.id)) continue

          agentLeads.push(lead)
          usedLeadIds.add(lead.id)
        }

        console.log(`Agent ${agent.id.slice(0,8)}: startIdx=${startIndex}, endIdx=${leadIndex}, assigned=${agentLeads.length}`)

        if (agentLeads.length === 0) continue

        // Arama listesi oluştur
        const items: CallListItem[] = agentLeads.map((l, idx) => ({
          leadId: l.id,
          businessName: l.businessName,
          phone: l.phone!,
          order: idx + 1,
          status: 'PENDING' as const,
          needScore: l.needScore,
        }))

        callLists.push({
          agentId: agent.id,
          listDate: day.date,
          items,
        })

        const stats = perAgentMap.get(agent.id)!
        stats.callCount += agentLeads.length
      }
    }
  }

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
