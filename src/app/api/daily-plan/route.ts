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

    const { error: e1 } = await supabase.from('assignments').delete().eq('scheduled_date', dateStr)
    const { error: e2 } = await supabase.from('routes').delete().eq('route_date', dateStr)
    const { error: e3 } = await supabase.from('call_lists').delete().eq('list_date', dateStr)
    const { error: e4 } = await supabase.from('weekly_plans').delete().eq('week_start', dateStr)

    if (e1 || e2 || e3 || e4) {
      logger.warn('Günlük sıfırlama sırasında bazı hatalar', {
        date: dateStr,
        assignments: e1?.message,
        routes: e2?.message,
        callLists: e3?.message,
        plans: e4?.message,
      })
    }

    logger.info('Günlük dağıtım sıfırlandı', { date: dateStr })

    return NextResponse.json({ success: true, date: dateStr })
  } catch (error) {
    logger.error('Daily plan DELETE hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
