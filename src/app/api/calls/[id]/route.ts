import { NextRequest, NextResponse } from 'next/server'
import { hydrateCallListItemsWithInstagram } from '@/infra/supabase/hydrate-call-list-items'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { updateCallOutcomeSchema } from '@/lib/validators'
import { logger } from '@/lib/logger'
import type { CallListItem } from '@/types/call'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateCallOutcomeSchema.parse(body)

    const supabase = createServiceRoleClient()

    const { data: callList, error: fetchError } = await supabase
      .from('call_lists')
      .select('id, agent_id, items')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      logger.error('Arama listesi getirilemedi', { error: fetchError.message })
      return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })
    }
    if (!callList) {
      return NextResponse.json({ error: 'Arama listesi bulunamadı' }, { status: 404 })
    }

    const items = (callList.items as CallListItem[]) ?? []
    const leadId = (body.lead_id as string | undefined) ??
      items.find((i) => i.status === 'PENDING')?.leadId

    if (!leadId) {
      return NextResponse.json({ error: 'Güncellenecek arama bulunamadı' }, { status: 404 })
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('update_call_item_atomic', {
      p_agent_id: callList.agent_id,
      p_lead_id: leadId,
      p_status: parsed.status ?? null,
      p_outcome: parsed.outcome ?? null,
      p_notes: parsed.notes ?? null,
    })

    if (rpcError) {
      if (rpcError.code === 'P0002') {
        return NextResponse.json(
          { error: rpcError.message, code: rpcError.message },
          { status: 404 }
        )
      }
      logger.error('Arama sonucu güncellenemedi', { error: rpcError.message, code: rpcError.code })
      return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
    }

    const result = rpcData as {
      call_list_id: string
      updated_item: CallListItem
      completed_items: number
      total_items: number
    }

    const { data: updated } = await supabase
      .from('call_lists')
      .select('*')
      .eq('id', result.call_list_id)
      .maybeSingle()

    if (!updated) {
      return NextResponse.json({ error: 'Güncel liste alınamadı' }, { status: 500 })
    }

    const hydratedItems = await hydrateCallListItemsWithInstagram(
      supabase,
      (updated.items as CallListItem[])
    )

    return NextResponse.json({
      ...updated,
      items: hydratedItems,
    })
  } catch (error) {
    logger.error('Call outcome PATCH hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
