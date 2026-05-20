import { type NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: 'Geçerli bir date parametresi gerekli (YYYY-MM-DD)' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase.rpc('reset_daily_plan_atomic', {
      p_date: dateStr,
    })

    if (error) {
      logger.error('Daily plan reset RPC hatası', { error: error.message, code: error.code })
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }

    logger.info('Günlük dağıtım sıfırlandı', { date: dateStr, stats: data })

    return NextResponse.json({ success: true, date: dateStr, stats: data })
  } catch (error) {
    logger.error('Daily plan DELETE hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
