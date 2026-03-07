import { type NextRequest, NextResponse } from 'next/server'
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
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Ajan kaydı bulunamadı' }, { status: 404 })
    }

    // Tarih parametresi: varsa kullan, yoksa bugün (Istanbul UTC+3)
    const { searchParams } = new URL(request.url)
    const istanbulOffset = 3 * 60 * 60 * 1000
    const istanbulToday = new Date(Date.now() + istanbulOffset).toISOString().split('T')[0]
    const date = searchParams.get('date') ?? istanbulToday

    const { data: callList } = await serviceClient
      .from('call_lists')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('list_date', date)
      .single()

    if (!callList) {
      return NextResponse.json(null)
    }

    // Telefonsuz lead'leri listeden filtrele
    const items = (callList.items as Array<{ phone: string | null; [key: string]: unknown }>)
      .filter((item) => item.phone !== null)
    const filtered = {
      ...callList,
      items,
      total_items: items.length,
      completed_items: items.filter((item) => item.status !== 'PENDING').length,
    }

    return NextResponse.json(filtered)
  } catch (error) {
    logger.error('My calls API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
