import { type NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { hydrateCallListItemsWithInstagram } from '@/infra/supabase/hydrate-call-list-items'
import { getTodayDateInIstanbul } from '@/lib/date-utils'
import { logger } from '@/lib/logger'
import type { CallListItem } from '@/types/call'

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

    // Tarih parametresi: varsa kullan, yoksa bugün (Istanbul)
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') ?? getTodayDateInIstanbul()

    const { data: callList } = await serviceClient
      .from('call_lists')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('list_date', date)
      .maybeSingle()

    if (!callList) {
      return NextResponse.json(null)
    }

    const hydratedItems = await hydrateCallListItemsWithInstagram(
      serviceClient,
      (callList.items as CallListItem[])
    )

    // Telefonsuz lead'leri listeden filtrele
    const items = hydratedItems.filter((item) => item.phone !== null)
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
