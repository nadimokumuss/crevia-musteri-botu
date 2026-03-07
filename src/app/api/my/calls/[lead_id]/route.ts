import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { logLeadActivity } from '@/infra/supabase/log-activity'
import { logger } from '@/lib/logger'
import type { CallListItem } from '@/types/call'

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

    // Tarih belirle
    const date = body.date ?? new Date().toISOString().split('T')[0]

    // Önce bu ajanın TÜM call_list'lerinde bu lead'i ara
    const { data: allCallLists } = await serviceClient
      .from('call_lists')
      .select('*')
      .eq('agent_id', agent.id)
      .order('list_date', { ascending: false })

    // Doğru call_list'i bul: önce verilen tarihe, yoksa lead_id'yi içerene bak
    let callList = (allCallLists ?? []).find((cl) => cl.list_date === date)

    if (!callList) {
      // Tarih eşleşmedi, lead_id içeren herhangi bir call_list ara
      callList = (allCallLists ?? []).find((cl) => {
        const items = cl.items as CallListItem[]
        return Array.isArray(items) && items.some((item) => item.leadId === lead_id)
      })
    }

    if (!callList) {
      logger.warn('Call list bulunamadı', { agent_id: agent.id, date, lead_id })
      return NextResponse.json(
        { error: `Arama listesi bulunamadı (tarih: ${date})` },
        { status: 404 }
      )
    }

    // Items dizisinde lead'i bul ve güncelle
    const existingItems = callList.items as CallListItem[]
    let found = false
    const items = existingItems.map((item) => {
      if (item.leadId === lead_id) {
        found = true
        return {
          ...item,
          ...(body.status && { status: body.status }),
          ...(body.outcome !== undefined && { outcome: body.outcome }),
          ...(body.notes !== undefined && { notes: body.notes }),
        }
      }
      return item
    })

    // Lead items'da yoksa ekle
    if (!found) {
      items.push({
        leadId: lead_id,
        order: items.length + 1,
        businessName: '',
        phone: null,
        needScore: 0,
        status: body.status ?? 'PENDING',
        outcome: body.outcome,
        notes: body.notes,
      })
    }

    const completedItems = items.filter(
      (item) => item.status !== 'PENDING'
    ).length

    const { error: updateError } = await serviceClient
      .from('call_lists')
      .update({ items, completed_items: completedItems })
      .eq('id', callList.id)

    if (updateError) {
      logger.error('Arama kaydı güncellenemedi', { error: updateError.message })
      return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
    }

    logLeadActivity({
      leadId: lead_id,
      activityType: 'CALL_LOGGED',
      description: `Arama sonucu: ${body.outcome ?? body.status ?? 'güncellendi'}`,
      agentId: agent.id,
      newValue: body.outcome ?? body.status,
      metadata: { notes: body.notes },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('My calls lead API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
