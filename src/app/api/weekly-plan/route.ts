import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import { manualWorkflowRequiredResponse } from '@/lib/route-status'

export async function POST() {
  return manualWorkflowRequiredResponse()
}

export async function GET() {
  try {
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('weekly_plans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error('Weekly plan getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data ?? null)
  } catch (error) {
    logger.error('Weekly plan GET hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const planId = searchParams.get('planId')

    if (!planId) {
      return NextResponse.json({ error: 'planId gerekli' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase.rpc('reset_weekly_plan_atomic', {
      p_plan_id: planId,
    })

    if (error) {
      if (error.code === 'P0002') {
        return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404 })
      }
      if (error.code === 'P0001' && error.message?.includes('PLAN_DISTRIBUTING')) {
        return NextResponse.json(
          { error: 'Dağıtım devam ederken plan silinemez' },
          { status: 400 }
        )
      }
      logger.error('Weekly plan reset RPC hatası', { error: error.message, code: error.code })
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }

    logger.info('Plan ve dagitim verileri silindi', { planId, stats: data })
    return NextResponse.json({ success: true, stats: data })
  } catch (error) {
    logger.error('Weekly plan DELETE hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
