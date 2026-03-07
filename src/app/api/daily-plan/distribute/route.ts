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
        debug: result.debug,
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

  // Lead'leri çek (puanlı, aktif) - Supabase varsayılan 1000 limiti var, açıkça yüksek limit ver
  const { data: leadsData } = await supabase
    .from('leads')
    .select('*')
    .in('status', ['NEW', 'CONTACTED'])
    .order('need_score', { ascending: false })
    .limit(10000)

  const allLeads = (leadsData ?? []) as Lead[]

  // Herhangi bir güne atanmış TÜM lead'leri hariç tut (tekrar atama önleme)
  // Status filtresi YOK - bir lead bir kez atandıysa bir daha atanamaz
  const { data: existingAssignments, error: assignmentQueryError } = await supabase
    .from('assignments')
    .select('lead_id, scheduled_date')
    .limit(50000)

  if (assignmentQueryError) {
    logger.error('Mevcut atamalar sorgulanamadı', { error: assignmentQueryError.message })
  }

  // Debug: Mevcut atamaların tarih dağılımını logla
  const dateDistribution: Record<string, number> = {}
  for (const a of existingAssignments ?? []) {
    const date = a.scheduled_date as string
    dateDistribution[date] = (dateDistribution[date] || 0) + 1
  }
  logger.info('Mevcut atama tarih dağılımı', { dateDistribution, totalAssignments: existingAssignments?.length ?? 0 })

  const assignedLeadIds = new Set(
    (existingAssignments ?? []).map((a) => a.lead_id as string)
  )

  const leads = allLeads.filter((l) => !assignedLeadIds.has(l.id))

  // Debug: Lead dağılımını logla
  const leadsWithPhone = leads.filter((l) => l.phone !== null)
  const leadsWithCoords = leads.filter((l) => l.lat !== null && l.lng !== null)
  const leadsWithBoth = leads.filter((l) => l.phone !== null && l.lat !== null && l.lng !== null)
  logger.info('Dağıtım öncesi lead analizi', {
    totalFromDb: allLeads.length,
    alreadyAssigned: assignedLeadIds.size,
    availableLeads: leads.length,
    leadsWithPhone: leadsWithPhone.length,
    leadsWithCoords: leadsWithCoords.length,
    leadsWithBoth: leadsWithBoth.length,
    leadsWithoutPhone: leads.length - leadsWithPhone.length,
  })

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
  }))

  // DEBUG: Dağıtıma gönderilen veriler
  const leadsWithPhoneForDist = distributionLeads.filter(l => l.phone !== null)
  console.log('=== DAĞITIM ÖNCESİ DEBUG ===')
  console.log('distributionLeads toplam:', distributionLeads.length)
  console.log('distributionLeads telefon numaralı:', leadsWithPhoneForDist.length)
  console.log('distributionAgents:', distributionAgents.length)
  console.log('TELESALES ajanları:', distributionAgents.filter(a => a.role === 'TELESALES_AGENT').length)
  console.log('weekDays:', weekDays)

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

  // Debug bilgileri
  const leadsWithoutPhoneAndCoords = leads.filter((l) => l.phone === null && l.lat === null)
  const leadsWithPhoneOnly = leads.filter((l) => l.phone !== null && l.lat === null)
  const leadsWithCoordsOnly = leads.filter((l) => l.phone === null && l.lat !== null)

  const debug = {
    totalLeadsInDb: allLeads.length,
    alreadyAssigned: assignedLeadIds.size,
    availableLeads: leads.length,
    leadsWithPhone: leadsWithPhone.length,
    leadsWithCoords: leadsWithCoords.length,
    leadsWithBoth: leadsWithBoth.length,
    leadsWithPhoneOnly: leadsWithPhoneOnly.length,
    leadsWithCoordsOnly: leadsWithCoordsOnly.length,
    leadsWithoutPhoneAndCoords: leadsWithoutPhoneAndCoords.length,
    fieldAgents: distributionAgents.filter(a => a.role === 'FIELD_AGENT').length,
    telesalesAgents: distributionAgents.filter(a => a.role === 'TELESALES_AGENT').length,
    assignmentDateDistribution: dateDistribution,
  }

  return { ...result, debug }
}
