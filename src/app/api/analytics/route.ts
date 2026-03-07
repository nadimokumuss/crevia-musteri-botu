import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import type {
  AnalyticsDashboardData,
  AnalyticsKPI,
  StatusCount,
  RecommendationCount,
  CategoryCount,
  AgentPerformance,
  CallOutcomeCount,
  TrendDataPoint,
} from '@/types'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Yeni',
  CONTACTED: 'İletişime Geçildi',
  QUALIFIED: 'Nitelikli',
  PROPOSAL: 'Teklif',
  WON: 'Kazanıldı',
  LOST: 'Kaybedildi',
  SKIP: 'Atlandı',
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  HIGH_PRIORITY: 'Yüksek Öncelik',
  MEDIUM: 'Orta',
  LOW_PRIORITY: 'Düşük Öncelik',
  SKIP: 'Atla',
}

const CALL_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Bekliyor',
  COMPLETED: 'Tamamlandı',
  NO_ANSWER: 'Cevap Yok',
  CALLBACK: 'Geri Aranacak',
  INTERESTED: 'İlgili',
  NOT_INTERESTED: 'İlgisiz',
  WRONG_NUMBER: 'Yanlış Numara',
  DEMO: 'Demo',
}

function getWeekStart(date: Date): string {
  const istanbulStr = date.toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' })
  const d = new Date(istanbulStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export async function GET(request: Request) {
  try {
    const supabase = createServiceRoleClient()

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const defaultEnd = now.toISOString().split('T')[0]
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const startDate = searchParams.get('startDate') || defaultStart
    const endDate = searchParams.get('endDate') || defaultEnd
    const endDateTime = endDate + 'T23:59:59'

    const thisWeekStart = getWeekStart(now)
    const lastWeekStart = getWeekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))

    const [
      leadsResult,
      assignmentsResult,
      callListsResult,
      agentsResult,
    ] = await Promise.all([
      // Lead'ler için tarih filtresi YOK - tüm lead'leri göster
      supabase.from('leads').select('id, status, recommendation, category, need_score, created_at'),
      supabase.from('assignments').select('id, agent_id, assignment_type, status, scheduled_date, agents!agent_id(full_name, role)').gte('scheduled_date', startDate).lte('scheduled_date', endDate),
      supabase.from('call_lists').select('id, items, total_items, completed_items, list_date').gte('list_date', startDate).lte('list_date', endDate),
      supabase.from('agents').select('id, full_name, role, is_active').eq('is_active', true),
    ])

    if (leadsResult.error) {
      logger.error('Analytics: leads sorgusu başarısız', { error: leadsResult.error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }
    if (assignmentsResult.error) {
      logger.error('Analytics: assignments sorgusu başarısız', { error: assignmentsResult.error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }
    if (callListsResult.error) {
      logger.error('Analytics: call_lists sorgusu başarısız', { error: callListsResult.error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }
    if (agentsResult.error) {
      logger.error('Analytics: agents sorgusu başarısız', { error: agentsResult.error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    const leads = leadsResult.data ?? []
    const assignments = assignmentsResult.data ?? []
    const callLists = callListsResult.data ?? []
    const agents = agentsResult.data ?? []

    // --- KPI ---
    const totalLeads = leads.length
    const newLeadsThisWeek = leads.filter((l) => l.created_at >= thisWeekStart).length
    const newLeadsLastWeek = leads.filter((l) => l.created_at >= lastWeekStart && l.created_at < thisWeekStart).length
    const totalWon = leads.filter((l) => l.status === 'WON').length
    const totalLost = leads.filter((l) => l.status === 'LOST').length
    const conversionRate = totalLeads > 0 ? Math.round((totalWon / totalLeads) * 100) : 0
    const avgNeedScore = totalLeads > 0 ? Math.round(leads.reduce((sum, l) => sum + (l.need_score ?? 0), 0) / totalLeads) : 0
    const totalAssignments = assignments.length
    const completedAssignments = assignments.filter((a) => a.status === 'COMPLETED').length
    const completionRate = totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0
    const totalCallItems = callLists.reduce((sum, cl) => {
      const items = (cl.items ?? []) as Array<{ status: string }>
      return sum + items.length
    }, 0)
    const completedCallItems = callLists.reduce((sum, cl) => {
      const items = (cl.items ?? []) as Array<{ status: string }>
      return sum + items.filter((i) => i.status !== 'PENDING').length
    }, 0)
    const callCompletionRate = totalCallItems > 0 ? Math.round((completedCallItems / totalCallItems) * 100) : 0

    const kpi: AnalyticsKPI = {
      totalLeads,
      newLeadsThisWeek,
      newLeadsLastWeek,
      totalWon,
      totalLost,
      conversionRate,
      avgNeedScore,
      totalAssignments,
      completedAssignments,
      completionRate,
      totalCallsMade: completedCallItems,
      callCompletionRate,
      activeAgents: agents.length,
    }

    // --- Status Funnel ---
    const statusMap = new Map<string, number>()
    for (const lead of leads) {
      statusMap.set(lead.status, (statusMap.get(lead.status) ?? 0) + 1)
    }
    const funnelOrder = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST', 'SKIP']
    const statusFunnel: StatusCount[] = funnelOrder.map((s) => ({
      status: s,
      label: STATUS_LABELS[s] ?? s,
      count: statusMap.get(s) ?? 0,
    }))

    // --- Recommendation Distribution ---
    const recMap = new Map<string, number>()
    for (const lead of leads) {
      recMap.set(lead.recommendation, (recMap.get(lead.recommendation) ?? 0) + 1)
    }
    const recommendationDistribution: RecommendationCount[] = ['HIGH_PRIORITY', 'MEDIUM', 'LOW_PRIORITY', 'SKIP'].map((r) => ({
      recommendation: r,
      label: RECOMMENDATION_LABELS[r] ?? r,
      count: recMap.get(r) ?? 0,
    }))

    // --- Category Breakdown ---
    const catMap = new Map<string, { count: number; totalScore: number }>()
    for (const lead of leads) {
      const cat = lead.category ?? 'Bilinmiyor'
      const existing = catMap.get(cat) ?? { count: 0, totalScore: 0 }
      existing.count += 1
      existing.totalScore += lead.need_score ?? 0
      catMap.set(cat, existing)
    }
    const categoryBreakdown: CategoryCount[] = Array.from(catMap.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        avgScore: Math.round(data.totalScore / data.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)

    // --- Agent Performance ---
    const agentMap = new Map<string, AgentPerformance>()
    for (const agent of agents) {
      agentMap.set(agent.id, {
        agentId: agent.id,
        agentName: agent.full_name,
        role: agent.role,
        totalAssignments: 0,
        completedAssignments: 0,
        completionRate: 0,
        totalVisits: 0,
        totalCalls: 0,
      })
    }
    for (const a of assignments) {
      const perf = agentMap.get(a.agent_id)
      if (!perf) continue
      perf.totalAssignments += 1
      if (a.status === 'COMPLETED') perf.completedAssignments += 1
      if (a.assignment_type === 'VISIT') perf.totalVisits += 1
      if (a.assignment_type === 'CALL') perf.totalCalls += 1
    }
    const agentPerformance: AgentPerformance[] = Array.from(agentMap.values()).map((p) => ({
      ...p,
      completionRate: p.totalAssignments > 0 ? Math.round((p.completedAssignments / p.totalAssignments) * 100) : 0,
    }))

    // --- Call Outcomes ---
    const callStatusMap = new Map<string, number>()
    for (const cl of callLists) {
      const items = (cl.items ?? []) as Array<{ status: string }>
      for (const item of items) {
        callStatusMap.set(item.status, (callStatusMap.get(item.status) ?? 0) + 1)
      }
    }
    const callOutcomes: CallOutcomeCount[] = Array.from(callStatusMap.entries())
      .map(([status, count]) => ({
        status,
        label: CALL_STATUS_LABELS[status] ?? status,
        count,
      }))
      .sort((a, b) => b.count - a.count)

    // --- Weekly Trend (dynamic based on date range) ---
    const weeklyMap = new Map<string, TrendDataPoint>()
    const rangeStart = new Date(startDate)
    const rangeEnd = new Date(endDate)
    const cursor = new Date(rangeStart)
    while (cursor <= rangeEnd) {
      const weekKey = getWeekStart(cursor)
      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          date: weekKey,
          newLeads: 0,
          wonLeads: 0,
          completedVisits: 0,
          completedCalls: 0,
        })
      }
      cursor.setDate(cursor.getDate() + 7)
    }
    // Ensure the last week is included
    const lastWeekKey = getWeekStart(rangeEnd)
    if (!weeklyMap.has(lastWeekKey)) {
      weeklyMap.set(lastWeekKey, {
        date: lastWeekKey,
        newLeads: 0,
        wonLeads: 0,
        completedVisits: 0,
        completedCalls: 0,
      })
    }
    for (const lead of leads) {
      const weekKey = getWeekStart(new Date(lead.created_at))
      const entry = weeklyMap.get(weekKey)
      if (entry) {
        entry.newLeads += 1
        if (lead.status === 'WON') entry.wonLeads += 1
      }
    }
    for (const a of assignments) {
      if (a.status !== 'COMPLETED') continue
      const weekKey = getWeekStart(new Date(a.scheduled_date))
      const entry = weeklyMap.get(weekKey)
      if (entry) {
        if (a.assignment_type === 'VISIT') entry.completedVisits += 1
        if (a.assignment_type === 'CALL') entry.completedCalls += 1
      }
    }
    const weeklyTrend: TrendDataPoint[] = Array.from(weeklyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

    const data: AnalyticsDashboardData = {
      kpi,
      statusFunnel,
      recommendationDistribution,
      categoryBreakdown,
      agentPerformance,
      callOutcomes,
      weeklyTrend,
      dateRange: { startDate, endDate },
      generatedAt: now.toISOString(),
    }

    logger.info('Analytics verisi getirildi', { totalLeads, totalAssignments })

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Analytics API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
