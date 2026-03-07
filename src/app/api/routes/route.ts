import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { createRouteSchema } from '@/lib/validators'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')
    const routeDate = searchParams.get('route_date')

    const supabase = createServiceRoleClient()

    let query = supabase.from('routes').select('*')

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    if (routeDate) {
      query = query.eq('route_date', routeDate)
    }

    query = query.order('route_date', { ascending: false }).limit(20)

    const { data, error } = await query

    if (error) {
      logger.error('Rotalar getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Routes API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createRouteSchema.parse(body)
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('routes')
      .upsert(parsed, { onConflict: 'agent_id,route_date' })
      .select()
      .single()

    if (error) {
      logger.error('Rota oluşturulamadı', { error: error.message })
      return NextResponse.json({ error: 'Rota oluşturulamadı' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    logger.error('Routes POST hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
