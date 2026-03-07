import { NextRequest, NextResponse } from 'next/server'
import { optimizeRouteSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { optimizeRoute } from '@/core/routing/route-optimizer'
import { clusterLeads } from '@/core/routing/geo-cluster'
import { logger } from '@/lib/logger'
import type { GeoPoint } from '@/types/geo'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = optimizeRouteSchema.parse(body)

    const supabase = createServiceRoleClient()

    // Ajan bilgilerini al (başlangıç noktası)
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, base_lat, base_lng')
      .eq('id', parsed.agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Ajan bulunamadı' }, { status: 404 })
    }

    const startPoint: GeoPoint = {
      lat: agent.base_lat ?? 41.0082,
      lng: agent.base_lng ?? 28.9784,
    }

    // Lead'lerin koordinatlarını al
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, lat, lng, business_name, phone')
      .in('id', parsed.lead_ids)

    if (leadsError || !leads) {
      return NextResponse.json({ error: 'Lead\'ler bulunamadı' }, { status: 404 })
    }

    const stops: GeoPoint[] = leads
      .filter((l) => l.lat !== null && l.lng !== null)
      .map((l) => ({
        lat: l.lat!,
        lng: l.lng!,
        id: l.id,
        label: l.business_name,
      }))

    if (stops.length === 0) {
      return NextResponse.json({ error: 'Koordinatlı lead bulunamadı' }, { status: 400 })
    }

    // Coğrafi kümeleme ile durakları grupla
    const clusters = clusterLeads(stops)
    const realClusters = clusters.filter((c) => !c.isNoise)

    // Rota optimize et
    const optimized = optimizeRoute(stops, startPoint)

    // Rota kaydet / güncelle
    // Lead bilgilerini id → lead map'ine dönüştür
    const leadMap = new Map(leads.map((l) => [l.id, l]))

    const routeStops = optimized.orderedStops.map((stop, idx) => {
      const lead = leadMap.get(stop.id!)
      return {
        lead_id: stop.id,
        order: idx + 1,
        lat: stop.lat,
        lng: stop.lng,
        status: 'PENDING',
        business_name: lead?.business_name ?? null,
        phone: lead?.phone ?? null,
      }
    })

    const { data: route, error: routeError } = await supabase
      .from('routes')
      .upsert(
        {
          agent_id: parsed.agent_id,
          route_date: parsed.route_date,
          stops: routeStops,
          total_distance_km: optimized.totalDistanceKm,
          estimated_duration_min: optimized.estimatedDurationMin,
          is_optimized: true,
        },
        { onConflict: 'agent_id,route_date' }
      )
      .select()
      .single()

    if (routeError) {
      logger.error('Rota kaydedilemedi', { error: routeError.message })
      return NextResponse.json({ error: 'Rota kaydedilemedi' }, { status: 500 })
    }

    logger.info('Rota optimize edildi', {
      agentId: parsed.agent_id,
      stops: stops.length,
      clusters: realClusters.length,
      distanceKm: optimized.totalDistanceKm,
    })

    return NextResponse.json({
      route,
      optimization: {
        totalDistanceKm: optimized.totalDistanceKm,
        estimatedDurationMin: optimized.estimatedDurationMin,
        stopCount: optimized.orderedStops.length,
      },
      clusters: realClusters.map((c) => ({
        id: c.id,
        centroid: c.centroid,
        stopCount: c.points.length,
        stops: c.points.map((p) => p.id),
      })),
    })
  } catch (error) {
    logger.error('Route optimize API hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
