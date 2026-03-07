import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import { dailyDistributeSchema } from '@/lib/validators'
import { distributeWeeklyPlan } from '@/core/scheduler/weekly-distributor'
import { getTodayPlan } from '@/core/scheduler/weekly-planner'
import type { WeeklyPlanStatus, Agent, Lead, AgentPreferences } from '@/types/database'
import type { AgentForDistribution, LeadForDistribution } from '@/core/scheduler/weekly-distributor'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = dailyDistributeSchema.parse(body)

    const supabase = createServiceRoleClient()

    // Gün tipini belirle
    let dateStr: string
    let dayType: string

    if (parsed.date) {
      dateStr = parsed.date
      const { getDayType } = await import('@/core/scheduler/weekly-planner')
      dayType = getDayType(new Date(dateStr + 'T00:00:00'))
    } else {
      const todayPlan = getTodayPlan()
      if (!todayPlan) {
        return NextResponse.json({ error: 'Bugün tatil günü (OFF), dağıtım yapılamaz' }, { status: 400 })
      }
      dateStr = todayPlan.date
      dayType = todayPlan.type
    }

    // OFF günlerde dağıtım yapma
    if (dayType === 'OFF') {
      return NextResponse.json(
        { error: 'Bugün tatil günü (OFF), dağıtım yapılamaz' },
        { status: 400 }
      )
    }

    // Mevcut dağıtım kontrolü
    const { data: existingPlan } = await supabase
      .from('weekly_plans')
      .select('id, status')
      .eq('week_start', dateStr)
      .single()

    if (existingPlan && !parsed.force) {
      if (existingPlan.status === 'COMPLETED') {
        return NextResponse.json(
          { error: 'Bugün zaten dağıtım yapılmış. Yeniden dağıtmak için force: true gönderin.', planId: existingPlan.id },
          { status: 409 }
        )
      }
      if (existingPlan.status === 'DISTRIBUTING') {
        return NextResponse.json({ error: 'Dağıtım zaten devam ediyor' }, { status: 409 })
      }
    }

    // force modunda eski verileri temizle
    if (existingPlan && parsed.force) {
      await supabase.from('assignments').delete().eq('scheduled_date', dateStr)
      await supabase.from('routes').delete().eq('route_date', dateStr)
      await supabase.from('call_lists').delete().eq('list_date', dateStr)
      await supabase.from('weekly_plans').delete().eq('id', existingPlan.id)

      logger.info('Günlük dağıtım sıfırlandı (force)', { date: dateStr })
    }

    // Plan kaydı oluştur
    const { data: plan, error: planError } = await supabase
      .from('weekly_plans')
      .insert({
        week_start: dateStr,
        status: 'DISTRIBUTING' as WeeklyPlanStatus,
        scrape_job_ids: [],
        total_scrape_jobs: 0,
        completed_scrape_jobs: 0,
      })
      .select()
      .single()

    if (planError || !plan) {
      logger.error('Günlük plan kaydı oluşturulamadı', { error: planError?.message })
      return NextResponse.json({ error: 'Plan oluşturulamadı' }, { status: 500 })
    }

    try {
      const result = await runDailyDistribution(supabase, dateStr, dayType)

      await supabase
        .from('weekly_plans')
        .update({
          status: 'COMPLETED' as WeeklyPlanStatus,
          distribution_stats: result.stats as unknown as Record<string, unknown>,
        })
        .eq('id', plan.id)

      logger.info('Günlük dağıtım tamamlandı', { date: dateStr, dayType, stats: result.stats })

      return NextResponse.json({
        status: 'COMPLETED',
        date: dateStr,
        dayType,
        stats: result.stats,
        planId: plan.id,
      })
    } catch (distError) {
      const errMsg = distError instanceof Error ? distError.message : 'Dağıtım hatası'
      logger.error('Günlük dağıtım hatası', { date: dateStr, error: errMsg })

      await supabase
        .from('weekly_plans')
        .update({
          status: 'FAILED' as WeeklyPlanStatus,
          error_message: errMsg,
        })
        .eq('id', plan.id)

      return NextResponse.json({ status: 'FAILED', errorMessage: errMsg }, { status: 500 })
    }
  } catch (error) {
    logger.error('Daily distribute hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sunucu hatası' },
      { status: 400 }
    )
  }
}

async function runDailyDistribution(
  supabase: ReturnType<typeof createServiceRoleClient>,
  dateStr: string,
  dayType: string
) {
  // Ajanlar + tercihler
  const { data: agentsData } = await supabase
    .from('agents')
    .select('*')
    .eq('is_active', true)
    .neq('role', 'ADMIN')

  const { data: prefsData } = await supabase
    .from('agent_preferences')
    .select('*')

  const agents = (agentsData ?? []) as Agent[]
  const prefsMap = new Map<string, AgentPreferences>()
  if (prefsData) {
    for (const p of prefsData) {
      prefsMap.set(p.agent_id, p as AgentPreferences)
    }
  }

  // Lead'leri pagination ile çek - Supabase max 1000 satır döndürüyor
  const allLeads: Lead[] = []
  const pageSize = 1000
  let page = 0
  let hasMore = true

  while (hasMore) {
    const { data: pageData, error: pageError } = await supabase
      .from('leads')
      .select('*')
      .in('status', ['NEW', 'CONTACTED'])
      .order('need_score', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (pageError) {
      logger.error('Lead sayfa çekme hatası', { page, error: pageError.message })
      break
    }

    if (pageData && pageData.length > 0) {
      allLeads.push(...(pageData as Lead[]))
      page++
      hasMore = pageData.length === pageSize
    } else {
      hasMore = false
    }
  }

  // Herhangi bir güne atanmış TÜM lead'leri hariç tut (tekrar atama önleme)
  // Assignments'ı da pagination ile çek
  const existingAssignments: Array<{ lead_id: string; scheduled_date: string }> = []
  let assignmentPage = 0
  let hasMoreAssignments = true

  while (hasMoreAssignments) {
    const { data: assignmentPageData, error: assignmentPageError } = await supabase
      .from('assignments')
      .select('lead_id, scheduled_date')
      .range(assignmentPage * pageSize, (assignmentPage + 1) * pageSize - 1)

    if (assignmentPageError) {
      logger.error('Assignment sayfa çekme hatası', { page: assignmentPage, error: assignmentPageError.message })
      break
    }

    if (assignmentPageData && assignmentPageData.length > 0) {
      existingAssignments.push(...assignmentPageData)
      assignmentPage++
      hasMoreAssignments = assignmentPageData.length === pageSize
    } else {
      hasMoreAssignments = false
    }
  }

  const assignedLeadIds = new Set(
    (existingAssignments ?? []).map((a) => a.lead_id as string)
  )

  const leads = allLeads.filter((l) => !assignedLeadIds.has(l.id))

  // Tek günlük weekDays
  const weekDays = [{ date: dateStr, type: dayType as 'FIELD' | 'REMOTE' | 'ADMIN' | 'OFF' }]

  // Dağıtım girdisini hazırla
  const distributionAgents: AgentForDistribution[] = agents.map((a) => {
    const prefs = prefsMap.get(a.id)
    return {
      id: a.id,
      role: a.role as 'FIELD_AGENT' | 'TELESALES_AGENT' | 'ADMIN',
      baseLat: a.base_lat,
      baseLng: a.base_lng,
      maxDailyVisits: a.max_daily_visits,
      districtIds: prefs?.district_ids ?? [],
      categories: prefs?.categories ?? [],
    }
  })

  const distributionLeads: LeadForDistribution[] = leads.map((l) => ({
    id: l.id,
    districtId: l.district_id,
    category: l.category,
    lat: l.lat,
    lng: l.lng,
    phone: l.phone,
    needScore: l.need_score,
    businessName: l.business_name,
    igUsername: l.ig_username,
  }))

  // Dağıt
  const result = distributeWeeklyPlan({
    agents: distributionAgents,
    leads: distributionLeads,
    weekDays,
  })

  // Dağıtım detaylarını logla
  const fieldAgentCount = distributionAgents.filter(a => a.role === 'FIELD_AGENT').length
  const telesalesAgentCount = distributionAgents.filter(a => a.role === 'TELESALES_AGENT').length
  const totalFieldLeads = result.routes.reduce((sum, r) => sum + r.stops.length, 0)
  const totalCallLeads = result.callLists.reduce((sum, c) => sum + c.items.length, 0)

  logger.info('Günlük dağıtım hesaplandı, DB yazılıyor', {
    date: dateStr,
    dayType,
    agentCount: distributionAgents.length,
    fieldAgents: fieldAgentCount,
    telesalesAgents: telesalesAgentCount,
    availableLeads: distributionLeads.length,
    leadsWithPhone: distributionLeads.filter(l => l.phone !== null).length,
    leadsWithCoords: distributionLeads.filter(l => l.lat !== null && l.lng !== null).length,
    routes: result.routes.length,
    callLists: result.callLists.length,
    totalFieldLeads,
    totalCallLeads,
    unassignedLeads: result.stats.unassignedLeads,
  })

  // Rotaları kaydet + assignments
  for (const route of result.routes) {
    const { error: routeErr } = await supabase.from('routes').upsert(
      {
        agent_id: route.agentId,
        route_date: route.routeDate,
        stops: route.stops,
        total_distance_km: route.totalDistanceKm,
        estimated_duration_min: route.estimatedDurationMin,
        is_optimized: true,
      },
      { onConflict: 'agent_id,route_date' }
    )
    if (routeErr) logger.error('Rota kaydedilemedi', { error: routeErr.message, agentId: route.agentId })

    const assignmentRows = route.stops.map((stop) => ({
      lead_id: stop.lead_id,
      agent_id: route.agentId,
      scheduled_date: route.routeDate,
      assignment_type: 'VISIT' as const,
      status: 'PENDING' as const,
    }))
    if (assignmentRows.length > 0) {
      const { error: asnErr } = await supabase
        .from('assignments')
        .upsert(assignmentRows, { onConflict: 'lead_id' })
      if (asnErr) logger.error('VISIT assignments yazılamadı', { error: asnErr.message, agentId: route.agentId })
    }
  }

  // Arama listelerini kaydet + assignments
  for (const callList of result.callLists) {
    const { error: clErr } = await supabase.from('call_lists').upsert(
      {
        agent_id: callList.agentId,
        list_date: callList.listDate,
        items: callList.items,
        total_items: callList.items.length,
        completed_items: 0,
      },
      { onConflict: 'agent_id,list_date' }
    )
    if (clErr) logger.error('Arama listesi kaydedilemedi', { error: clErr.message, agentId: callList.agentId })

    const assignmentRows = callList.items.map((item) => ({
      lead_id: item.leadId,
      agent_id: callList.agentId,
      scheduled_date: callList.listDate,
      assignment_type: 'CALL' as const,
      status: 'PENDING' as const,
    }))
    if (assignmentRows.length > 0) {
      const { error: asnErr } = await supabase
        .from('assignments')
        .upsert(assignmentRows, { onConflict: 'lead_id' })
      if (asnErr) logger.error('CALL assignments yazılamadı', { error: asnErr.message, agentId: callList.agentId })
    }
  }

  return result
}
