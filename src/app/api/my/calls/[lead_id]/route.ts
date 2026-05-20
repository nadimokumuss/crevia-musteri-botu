import { NextRequest, NextResponse } from 'next/server'
import { hydrateCallListItemsWithInstagram } from '@/infra/supabase/hydrate-call-list-items'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import { updateCallOutcomeSchema } from '@/lib/validators'
import type { CallListItem } from '@/types/call'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const { lead_id } = await params
    const body = await request.json()
    const parsed = updateCallOutcomeSchema.parse({
      status: body.status,
      outcome: body.outcome,
      notes: body.notes,
    })

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    const serviceClient = createServiceRoleClient()

    const { data: agent } = await serviceClient
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!agent) {
      return NextResponse.json({ error: 'Ajan kaydı bulunamadı' }, { status: 404 })
    }

    // Atomik RPC: items JSONB güncelleme + assignment status + activity log
    // FOR UPDATE row lock ile lost-update riski yok
    const { data: rpcData, error: rpcError } = await serviceClient.rpc('update_call_item_atomic', {
      p_agent_id: agent.id,
      p_lead_id: lead_id,
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
      logger.error('Arama kaydı güncellenemedi', {
        error: rpcError.message,
        code: rpcError.code,
        leadId: lead_id,
      })
      return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
    }

    const result = rpcData as {
      call_list_id: string
      updated_item: CallListItem
      completed_items: number
      total_items: number
    }

    // Response: güncel call_list items'ını döndür ki client state'i replace edebilsin
    const { data: callList } = await serviceClient
      .from('call_lists')
      .select('items')
      .eq('id', result.call_list_id)
      .maybeSingle()

    const items = (callList?.items as CallListItem[]) ?? []
    const hydratedItems = await hydrateCallListItemsWithInstagram(serviceClient, items)

    return NextResponse.json({
      success: true,
      items: hydratedItems,
      completedItems: result.completed_items,
      totalItems: result.total_items,
    })
  } catch (error) {
    logger.error('My calls lead API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
