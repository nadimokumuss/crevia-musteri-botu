import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

interface CallListItemRaw {
  leadId: string
  status: string
  notes?: string
  outcome?: string
}

interface CallListRow {
  list_date: string
  items: CallListItemRaw[]
}

export async function GET() {
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

    // 1. Tüm CALL atamalarını leads ile join ederek çek
    const { data: assignments, error: assignError } = await serviceClient
      .from('assignments')
      .select(`
        lead_id,
        scheduled_date,
        leads!inner (
          id,
          business_name,
          category,
          phone,
          email,
          need_score,
          recommendation,
          ig_username
        )
      `)
      .eq('agent_id', agent.id)
      .eq('assignment_type', 'CALL')
      .order('scheduled_date', { ascending: false })
      .limit(500)

    if (assignError) {
      logger.error('Telesales leads API — assignments hatası', { error: assignError.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    // 2. Tüm call_lists kayıtlarını çek
    const { data: callLists, error: callError } = await serviceClient
      .from('call_lists')
      .select('list_date, items')
      .eq('agent_id', agent.id)

    if (callError) {
      logger.error('Telesales leads API — call_lists hatası', { error: callError.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    // 3. call_lists items → Map<leadId, {status, notes, outcome, listDate}>
    //    Aynı lead birden fazla tarihte varsa en son list_date'i al
    const callOutcomeMap = new Map<string, {
      status: string
      notes: string | null
      outcome: string | null
      listDate: string
    }>()

    for (const cl of (callLists ?? []) as CallListRow[]) {
      const items = cl.items as CallListItemRaw[]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const existing = callOutcomeMap.get(item.leadId)
        if (!existing || cl.list_date > existing.listDate) {
          callOutcomeMap.set(item.leadId, {
            status: item.status ?? 'PENDING',
            notes: item.notes ?? null,
            outcome: item.outcome ?? null,
            listDate: cl.list_date,
          })
        }
      }
    }

    // 4. Merge: assignment + call outcome
    const result = (assignments ?? []).map((a: Record<string, unknown>) => {
      const lead = a.leads as Record<string, unknown>
      const leadId = lead.id as string
      const callInfo = callOutcomeMap.get(leadId)

      return {
        id: leadId,
        business_name: lead.business_name,
        category: lead.category ?? null,
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        need_score: lead.need_score ?? 0,
        recommendation: lead.recommendation ?? null,
        ig_username: (lead.ig_username as string | null) ?? null,
        scheduled_date: a.scheduled_date as string,
        call_list_date: callInfo?.listDate ?? (a.scheduled_date as string),
        call_status: callInfo?.status ?? 'PENDING',
        call_notes: callInfo?.notes ?? null,
        call_outcome: callInfo?.outcome ?? null,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Telesales leads API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
