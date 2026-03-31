import { NextRequest, NextResponse } from 'next/server'
import { hydrateCallListItemsWithInstagram } from '@/infra/supabase/hydrate-call-list-items'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { updateCallOutcomeSchema } from '@/lib/validators'
import { logger } from '@/lib/logger'
import { logLeadActivity } from '@/infra/supabase/log-activity'
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

    // Mevcut arama listesini al
    const { data: callList, error: fetchError } = await supabase
      .from('call_lists')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !callList) {
      return NextResponse.json({ error: 'Arama listesi bulunamadı' }, { status: 404 })
    }

    // İlk PENDING item'ı güncelle veya body'den lead_id ile bul
    const items = callList.items as Array<{
      leadId: string
      order: number
      businessName: string
      phone: string | null
      needScore: number
      status: string
      outcome?: string
      notes?: string
    }>

    const leadId = body.lead_id as string | undefined
    const itemIndex = leadId
      ? items.findIndex((i) => i.leadId === leadId)
      : items.findIndex((i) => i.status === 'PENDING')

    if (itemIndex === -1) {
      return NextResponse.json({ error: 'Güncellenecek arama bulunamadı' }, { status: 404 })
    }

    if (parsed.status) items[itemIndex].status = parsed.status
    if (parsed.outcome !== undefined) items[itemIndex].outcome = parsed.outcome
    if (parsed.notes !== undefined) items[itemIndex].notes = parsed.notes

    const completedCount = items.filter((i) => i.status !== 'PENDING').length

    const { data: updated, error: updateError } = await supabase
      .from('call_lists')
      .update({
        items,
        completed_items: completedCount,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      logger.error('Arama sonucu güncellenemedi', { error: updateError.message })
      return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
    }

    const nextAssignmentStatus =
      !parsed.status || parsed.status === 'PENDING'
        ? 'PENDING'
        : parsed.status === 'COMPLETED' || parsed.status === 'INTERESTED'
          ? 'COMPLETED'
          : 'IN_PROGRESS'

    await supabase
      .from('assignments')
      .update({ status: nextAssignmentStatus })
      .eq('lead_id', items[itemIndex].leadId)
      .eq('assignment_type', 'CALL')

    logLeadActivity({
      leadId: items[itemIndex].leadId,
      activityType: 'CALL_LOGGED',
      description: `Arama sonucu: ${parsed.outcome ?? parsed.status ?? 'guncellendi'}`,
      newValue: parsed.outcome ?? parsed.status ?? null,
      metadata: { call_list_id: id, notes: parsed.notes },
    })

    logger.info('Arama sonucu güncellendi', {
      callListId: id,
      leadId: items[itemIndex].leadId,
      status: parsed.status,
    })

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
