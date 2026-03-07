import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const supabase = createServiceRoleClient()

    const updateData: Record<string, unknown> = {}

    if (body.stops !== undefined) {
      updateData.stops = body.stops
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Güncellenecek alan bulunamadı' }, { status: 400 })
    }

    const { data: route, error } = await supabase
      .from('routes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Rota güncellenemedi', { error: error.message })
      return NextResponse.json({ error: 'Rota güncellenemedi' }, { status: 500 })
    }

    return NextResponse.json(route)
  } catch (error) {
    logger.error('Route PATCH hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
