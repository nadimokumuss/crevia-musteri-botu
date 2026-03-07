import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { generateCallList } from '@/core/routing/call-list-generator'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const createCallListSchema = z.object({
  agent_id: z.string().uuid(),
  list_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  max_items: z.number().int().min(1).max(100).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createCallListSchema.parse(body)

    const supabase = createServiceRoleClient()

    // Önceden atanmış lead'leri belirle — tüm mevcut call_lists'ten lead ID'leri topla
    const { data: existingLists } = await supabase
      .from('call_lists')
      .select('items')

    const assignedLeadIds = new Set<string>()
    if (existingLists) {
      for (const list of existingLists) {
        const items = list.items as Array<{ leadId: string }> | null
        if (items) {
          for (const item of items) {
            assignedLeadIds.add(item.leadId)
          }
        }
      }
    }

    // Henüz aranmamış, yüksek puanlı lead'leri al
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, business_name, phone, need_score')
      .not('phone', 'is', null)
      .gte('need_score', 20)
      .in('status', ['NEW', 'CONTACTED'])
      .order('need_score', { ascending: false })
      .limit((parsed.max_items ?? 30) + assignedLeadIds.size)

    if (leadsError) {
      logger.error('Lead\'ler getirilemedi', { error: leadsError.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    // Zaten bir arama listesinde olan lead'leri hariç tut
    const freshLeads = (leads ?? []).filter((l) => !assignedLeadIds.has(l.id))
    const duplicatesExcluded = (leads ?? []).length - freshLeads.length

    if (freshLeads.length === 0) {
      logger.info('Yeni lead bulunamadı — tümü zaten atanmış', {
        agentId: parsed.agent_id,
        date: parsed.list_date,
        duplicatesExcluded,
      })
      return NextResponse.json(
        {
          error: 'Tüm uygun işletmeler zaten bir arama listesinde. Yeni işletme taratmanız gerekiyor.',
          code: 'NO_NEW_LEADS',
          duplicatesExcluded,
        },
        { status: 409 }
      )
    }

    const callItems = generateCallList(
      freshLeads.map((l) => ({
        id: l.id,
        businessName: l.business_name,
        phone: l.phone,
        needScore: l.need_score,
      })),
      { maxItems: parsed.max_items }
    )

    // Arama listesi kaydet / güncelle
    const { data: callList, error: insertError } = await supabase
      .from('call_lists')
      .upsert(
        {
          agent_id: parsed.agent_id,
          list_date: parsed.list_date,
          items: callItems,
          total_items: callItems.length,
          completed_items: 0,
        },
        { onConflict: 'agent_id,list_date' }
      )
      .select()
      .single()

    if (insertError) {
      logger.error('Arama listesi kaydedilemedi', { error: insertError.message })
      return NextResponse.json({ error: 'Liste kaydedilemedi' }, { status: 500 })
    }

    logger.info('Arama listesi oluşturuldu', {
      agentId: parsed.agent_id,
      date: parsed.list_date,
      itemCount: callItems.length,
      duplicatesExcluded,
    })

    return NextResponse.json({ ...callList, duplicatesExcluded }, { status: 201 })
  } catch (error) {
    logger.error('Calls POST hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')
    const listDate = searchParams.get('list_date')

    const supabase = createServiceRoleClient()

    let query = supabase.from('call_lists').select('*')

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    if (listDate) {
      query = query.eq('list_date', listDate)
    }

    query = query.order('list_date', { ascending: false }).limit(20)

    const { data, error } = await query

    if (error) {
      logger.error('Arama listeleri getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Calls GET hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
