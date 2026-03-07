import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { distributeLeads, getDistributionStats } from '@/core/assignment/distributor'
import { acquireLock } from '@/core/assignment/collision-guard'
import { clusterLeads } from '@/core/routing/geo-cluster'
import { getDayType } from '@/core/scheduler/weekly-planner'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import type { GeoPoint } from '@/types/geo'

const distributeSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lead_ids: z.array(z.string().uuid()).optional(),
  min_score: z.number().int().min(0).max(100).optional().default(20),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = distributeSchema.parse(body)

    const supabase = createServiceRoleClient()

    // Gün tipini belirle
    const date = new Date(parsed.scheduled_date + 'T00:00:00')
    const dayType = getDayType(date)

    if (dayType === 'OFF') {
      return NextResponse.json({ error: 'Seçilen tarih tatil günü' }, { status: 400 })
    }

    const assignmentType = dayType === 'FIELD' ? 'VISIT' : 'CALL'

    // Uygun ajanları al
    const roleFilter = dayType === 'FIELD' ? 'FIELD_AGENT' : 'TELESALES_AGENT'
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, max_daily_visits')
      .eq('role', roleFilter)
      .eq('is_active', true)

    if (agentsError || !agents || agents.length === 0) {
      return NextResponse.json({ error: 'Uygun ajan bulunamadı' }, { status: 400 })
    }

    // Mevcut yükleri hesapla (tek sorgu ile N+1 sorunu önlenir)
    const agentIds = agents.map((a) => a.id)
    const { data: existingLoads } = await supabase
      .from('assignments')
      .select('agent_id')
      .in('agent_id', agentIds)
      .eq('scheduled_date', parsed.scheduled_date)
      .in('status', ['PENDING', 'IN_PROGRESS'])

    // Ajan başına yük sayısını hesapla
    const loadCounts = new Map<string, number>()
    for (const load of existingLoads ?? []) {
      loadCounts.set(load.agent_id, (loadCounts.get(load.agent_id) ?? 0) + 1)
    }

    const agentCapacities = agents.map((agent) => ({
      agentId: agent.id,
      maxDaily: agent.max_daily_visits,
      currentLoad: loadCounts.get(agent.id) ?? 0,
    }))

    // Önceden atanmış lead'leri belirle
    const { data: existingAssignments } = await supabase
      .from('assignments')
      .select('lead_id')

    const assignedLeadIds = new Set<string>()
    if (existingAssignments) {
      for (const a of existingAssignments) {
        assignedLeadIds.add(a.lead_id)
      }
    }

    // Lead'leri al
    let leadIds = parsed.lead_ids

    if (!leadIds || leadIds.length === 0) {
      let query = supabase
        .from('leads')
        .select('id, lat, lng')
        .gte('need_score', parsed.min_score)
        .in('status', ['NEW', 'CONTACTED'])
        .order('need_score', { ascending: false })
        .limit(100 + assignedLeadIds.size)

      // Telefon günlerinde telefonsuz lead'leri dahil etme
      if (dayType === 'REMOTE') {
        query = query.not('phone', 'is', null)
      }

      const { data: leads } = await query

      // Zaten atanmış lead'leri hariç tut
      const freshLeads = (leads ?? []).filter((l) => !assignedLeadIds.has(l.id))

      if (freshLeads.length === 0) {
        return NextResponse.json(
          { error: 'Tüm uygun lead\'ler zaten dağıtılmış. Yeni işletme taratmanız gerekiyor.' },
          { status: 400 }
        )
      }

      // Saha günlerinde coğrafi kümeleme ile aynı bölgedeki lead'leri grupla
      if (dayType === 'FIELD') {
        const geoLeads: GeoPoint[] = freshLeads
          .filter((l) => l.lat !== null && l.lng !== null)
          .map((l) => ({ lat: l.lat!, lng: l.lng!, id: l.id }))

        if (geoLeads.length >= 3) {
          const clusters = clusterLeads(geoLeads)
          // Kümelenmiş lead'leri küme sırasına göre diz (aynı küme = aynı ajan)
          const orderedIds: string[] = []
          for (const cluster of clusters) {
            for (const point of cluster.points) {
              if (point.id) orderedIds.push(point.id)
            }
          }
          // Koordinatsız lead'leri sona ekle
          const geoIdSet = new Set(orderedIds)
          for (const l of freshLeads) {
            if (!geoIdSet.has(l.id)) orderedIds.push(l.id)
          }
          leadIds = orderedIds
        } else {
          leadIds = freshLeads.map((l) => l.id)
        }
      } else {
        leadIds = freshLeads.map((l) => l.id)
      }
    }

    if (leadIds.length === 0) {
      return NextResponse.json({ error: 'Dağıtılacak lead bulunamadı' }, { status: 400 })
    }

    // Round-robin dağıtım (kümelenmiş lead'ler ardışık olduğu için aynı ajana düşer)
    const result = distributeLeads({
      leadIds,
      agents: agentCapacities,
      assignmentType: assignmentType as 'VISIT' | 'CALL',
    })

    // Atamaları oluştur (kilit ile)
    let successCount = 0
    let failCount = 0

    for (const [agentId, agentLeadIds] of result.assignments) {
      for (const leadId of agentLeadIds) {
        try {
          await acquireLock(leadId, agentId, parsed.scheduled_date, assignmentType as 'VISIT' | 'CALL')
          successCount++
        } catch {
          failCount++
        }
      }
    }

    const stats = getDistributionStats(result)

    logger.info('Dağıtım tamamlandı', {
      date: parsed.scheduled_date,
      dayType,
      successCount,
      failCount,
      unassigned: stats.totalUnassigned,
    })

    return NextResponse.json({
      message: 'Dağıtım tamamlandı',
      stats: {
        ...stats,
        successCount,
        failCount,
        assignmentType,
        dayType,
      },
    })
  } catch (error) {
    logger.error('Distribute API hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
