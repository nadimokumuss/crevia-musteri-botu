import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import { distributeWeeklyPlan } from '@/core/scheduler/weekly-distributor'
import { getWorkDays } from '@/core/scheduler/weekly-planner'
import type { WeeklyPlan, WeeklyPlanStatus, Agent, Lead, AgentPreferences } from '@/types/database'
import type { AgentForDistribution, LeadForDistribution } from '@/core/scheduler/weekly-distributor'

// Dağıtım uzun sürebilir
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const planId = body.planId as string | undefined

    if (!planId) {
      return NextResponse.json({ error: 'planId gerekli' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data: plan, error: planError } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404 })
    }

    const typedPlan = plan as WeeklyPlan

    // Zaten tamamlanmış veya dağıtılıyorsa tekrar tetikleme
    if (typedPlan.status === 'COMPLETED') {
      return NextResponse.json({
        status: 'COMPLETED',
        stats: typedPlan.distribution_stats,
      })
    }

    if (typedPlan.status === 'DISTRIBUTING') {
      return NextResponse.json({ error: 'Dağıtım zaten devam ediyor' }, { status: 409 })
    }

    // Dağıtıma geç
    await supabase
      .from('weekly_plans')
      .update({ status: 'DISTRIBUTING' as WeeklyPlanStatus })
      .eq('id', planId)

    try {
      const result = await runDistribution(supabase, typedPlan)

      await supabase
        .from('weekly_plans')
        .update({
          status: 'COMPLETED' as WeeklyPlanStatus,
          distribution_stats: result.stats as unknown as Record<string, unknown>,
        })
        .eq('id', planId)

      return NextResponse.json({
        status: 'COMPLETED',
        stats: result.stats,
      })
    } catch (distError) {
      const errMsg = distError instanceof Error ? distError.message : 'Dağıtım hatası'
      logger.error('Dağıtım hatası', { planId, error: errMsg })

      await supabase
        .from('weekly_plans')
        .update({
          status: 'FAILED' as WeeklyPlanStatus,
          error_message: errMsg,
        })
        .eq('id', planId)

      return NextResponse.json({
        status: 'FAILED',
        errorMessage: errMsg,
      }, { status: 500 })
    }
  } catch (error) {
    logger.error('Weekly plan distribute hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

async function runDistribution(
  supabase: ReturnType<typeof createServiceRoleClient>,
  plan: WeeklyPlan
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

  // Lead'leri çek (puanlı, aktif)
  const { data: leadsData } = await supabase
    .from('leads')
    .select('*')
    .in('status', ['NEW', 'CONTACTED'])
    .order('need_score', { ascending: false })
    .limit(2000)

  const allLeads = (leadsData ?? []) as Lead[]

  // Herhangi bir güne atanmış aktif lead'leri hariç tut (çapraz gün tekrar atama önleme)
  const { data: existingAssignments } = await supabase
    .from('assignments')
    .select('lead_id')
    .in('status', ['PENDING', 'IN_PROGRESS'])

  const assignedLeadIds = new Set(
    (existingAssignments ?? []).map((a) => a.lead_id as string)
  )

  const leads = allLeads.filter((l) => !assignedLeadIds.has(l.id))

  // Hafta günlerini oluştur (week_start = Pazartesi, +4 gün = Cuma)
  const weekStartDate = new Date(plan.week_start + 'T00:00:00')
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekEndDate.getDate() + 4)
  const weekDays = getWorkDays(weekStartDate, weekEndDate)
    .map((d) => ({
      date: d.date.toISOString().split('T')[0],
      type: d.type,
    }))

  // Dağıtım girdisini hazırla (tercihsiz ajanlar da dahil — boş tercih = tüm lead'lere açık)
  const distributionAgents: AgentForDistribution[] = agents
    .map((a) => {
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
  }))

  // Dağıt
  const result = distributeWeeklyPlan({
    agents: distributionAgents,
    leads: distributionLeads,
    weekDays,
  })

  logger.info('Dağıtım hesaplandı, DB kayıtları yazılıyor', {
    planId: plan.id,
    weekDays: weekDays.map((d) => `${d.date}:${d.type}`),
    agentCount: distributionAgents.length,
    leadCount: distributionLeads.length,
    routes: result.routes.length,
    callLists: result.callLists.length,
  })

  // Rotaları kaydet + assignments oluştur
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

    // Her durak için assignments kaydı oluştur
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
        .upsert(assignmentRows, { onConflict: 'lead_id,scheduled_date,assignment_type' })
      if (asnErr) logger.error('VISIT assignments yazılamadı', { error: asnErr.message, agentId: route.agentId })
    }
  }

  // Arama listelerini kaydet + assignments oluştur
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

    // Her arama için assignments kaydı oluştur
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
        .upsert(assignmentRows, { onConflict: 'lead_id,scheduled_date,assignment_type' })
      if (asnErr) logger.error('CALL assignments yazılamadı', { error: asnErr.message, agentId: callList.agentId })
    }
  }

  logger.info('Haftalık dağıtım tamamlandı', {
    planId: plan.id,
    routes: result.routes.length,
    callLists: result.callLists.length,
    stats: result.stats,
  })

  return result
}
