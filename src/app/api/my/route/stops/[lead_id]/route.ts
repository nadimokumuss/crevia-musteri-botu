import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { logLeadActivity } from '@/infra/supabase/log-activity'
import { logger } from '@/lib/logger'
import type { RouteStop } from '@/types/database'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const { lead_id } = await params
    const body = await request.json()

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    const serviceClient = createServiceRoleClient()

    // user_id'den agent_id bul
    const { data: agent } = await serviceClient
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Ajan kaydı bulunamadı' }, { status: 404 })
    }

    // İlgili tarihin rotasını getir
    const date = body.date ?? new Date().toISOString().split('T')[0]
    const { data: route } = await serviceClient
      .from('routes')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('route_date', date)
      .single()

    if (!route) {
      return NextResponse.json({ error: 'Rota bulunamadı' }, { status: 404 })
    }

    // İlgili durağı güncelle
    const stops = (route.stops as RouteStop[]).map((stop) => {
      if (stop.lead_id === lead_id) {
        return {
          ...stop,
          ...(body.status && { status: body.status }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.outcome && { outcome: body.outcome }),
          ...(body.status && { completed_at: body.status === 'PENDING' ? null : new Date().toISOString() }),
        }
      }
      return stop
    })

    const { error: updateError } = await serviceClient
      .from('routes')
      .update({ stops })
      .eq('id', route.id)

    if (updateError) {
      logger.error('Durak güncellenemedi', { error: updateError.message })
      return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
    }

    logLeadActivity({
      leadId: lead_id,
      activityType: 'VISIT_LOGGED',
      description: `Ziyaret sonucu: ${body.outcome ?? body.status ?? 'güncellendi'}`,
      agentId: agent.id,
      newValue: body.outcome ?? body.status,
      metadata: { notes: body.notes },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('My route stops API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
