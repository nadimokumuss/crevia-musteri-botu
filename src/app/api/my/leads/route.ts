import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
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
      .maybeSingle()

    if (!agent) {
      return NextResponse.json({ error: 'Ajan kaydı bulunamadı' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    // Atanmış lead'leri getir (assignments + leads join)
    let query = serviceClient
      .from('assignments')
      .select(`
        id,
        lead_id,
        assignment_type,
        scheduled_date,
        status,
        leads!inner (
          id,
          business_name,
          category,
          phone,
          email,
          need_score,
          recommendation
        )
      `)
      .eq('agent_id', agent.id)
      .order('scheduled_date', { ascending: false })
      .limit(100)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: assignments, error } = await query

    if (error) {
      logger.error('My leads API hatası', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    // Düz bir dizi olarak döndür
    const leads = (assignments ?? []).map((a: Record<string, unknown>) => {
      const lead = a.leads as Record<string, unknown>
      return {
        ...lead,
        assignment_id: a.id,
        assignment_status: a.status,
        assignment_type: a.assignment_type,
        scheduled_date: a.scheduled_date,
      }
    })

    return NextResponse.json(leads)
  } catch (error) {
    logger.error('My leads API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
