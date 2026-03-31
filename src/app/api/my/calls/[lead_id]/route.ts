import { NextRequest, NextResponse } from 'next/server'
import { hydrateCallListItemsWithInstagram } from '@/infra/supabase/hydrate-call-list-items'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { logLeadActivity } from '@/infra/supabase/log-activity'
import { getTodayDateInIstanbul } from '@/lib/date-utils'
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
    const date = body.date ?? getTodayDateInIstanbul()

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
          ...(parsed.status && { status: parsed.status }),
          ...(parsed.outcome !== undefined && { outcome: parsed.outcome }),
          ...(parsed.notes !== undefined && { notes: parsed.notes }),
        }
      }
      return item
    })

    if (!found) {
      return NextResponse.json(
        { error: `Bu lead secilen arama listesinde bulunamadi (tarih: ${date})` },
        { status: 404 }
      )
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

    // Assignment status'ünü senkronize et
    if (parsed.status) {
      const assignmentStatus = parsed.status === 'PENDING'
        ? 'PENDING'
        : parsed.status === 'COMPLETED' || parsed.status === 'INTERESTED'
          ? 'COMPLETED'
          : 'IN_PROGRESS'

      serviceClient
        .from('assignments')
        .update({ status: assignmentStatus })
        .eq('lead_id', lead_id)
        .eq('agent_id', agent.id)
        .eq('assignment_type', 'CALL')
        .then(({ error: assignErr }) => {
          if (assignErr) {
            logger.warn('Assignment status güncellenemedi', { error: assignErr.message, lead_id })
          }
        })
    }

    logLeadActivity({
      leadId: lead_id,
      activityType: 'CALL_LOGGED',
      description: `Arama sonucu: ${parsed.outcome ?? parsed.status ?? 'guncellendi'}`,
      agentId: agent.id,
      newValue: parsed.outcome ?? parsed.status ?? null,
      metadata: { notes: parsed.notes ?? null },
    })

    const hydratedItems = await hydrateCallListItemsWithInstagram(
      serviceClient,
      items
    )

    return NextResponse.json({
      success: true,
      items: hydratedItems,
    })
  } catch (error) {
    logger.error('My calls lead API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
