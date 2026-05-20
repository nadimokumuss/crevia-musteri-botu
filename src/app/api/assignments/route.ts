import { NextRequest, NextResponse } from 'next/server'
import { createAssignmentSchema, updateAssignmentSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logLeadActivity } from '@/infra/supabase/log-activity'
import { acquireLock, releaseLock } from '@/core/assignment/collision-guard'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')
    const date = searchParams.get('scheduled_date')
    const status = searchParams.get('status')

    const supabase = createServiceRoleClient()

    let query = supabase
      .from('assignments')
      .select('*, leads(business_name, need_score), agents!agent_id(full_name)')

    if (agentId) query = query.eq('agent_id', agentId)
    if (date) query = query.eq('scheduled_date', date)
    if (status) query = query.eq('status', status)

    query = query.order('scheduled_date', { ascending: false }).limit(50)

    const { data, error } = await query

    if (error) {
      logger.error('Atamalar getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Assignments GET hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createAssignmentSchema.parse(body)

    // Çatışma kontrolü ile kilit al
    const lock = await acquireLock(
      parsed.lead_id,
      parsed.agent_id,
      parsed.scheduled_date,
      parsed.assignment_type
    )

    if (!lock.acquired) {
      return NextResponse.json({ error: 'Atama oluşturulamadı' }, { status: 409 })
    }

    await logLeadActivity({
      leadId: parsed.lead_id,
      activityType: 'ASSIGNMENT_CREATED',
      description: `Yeni ${parsed.assignment_type} ataması oluşturuldu (${parsed.scheduled_date})`,
      agentId: parsed.agent_id,
      metadata: { assignment_type: parsed.assignment_type, scheduled_date: parsed.scheduled_date },
    })

    return NextResponse.json(
      { assignmentId: lock.lockId, status: 'PENDING' },
      { status: 201 }
    )
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('kilitlenmiş') || error.message.includes('atanmis'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    logger.error('Assignments POST hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get('id')

    if (!assignmentId) {
      return NextResponse.json({ error: 'Atama ID gerekli' }, { status: 400 })
    }

    const body = await request.json()
    const parsed = updateAssignmentSchema.parse(body)

    const supabase = createServiceRoleClient()

    const { data: existing, error: fetchError } = await supabase
      .from('assignments')
      .select('id, status, lead_id, agent_id')
      .eq('id', assignmentId)
      .maybeSingle()

    if (fetchError) {
      logger.error('Atama bilgisi alinamadi', { error: fetchError.message })
      return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Atama bulunamadı' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('assignments')
      .update(parsed)
      .eq('id', assignmentId)
      .select('*, leads(business_name, need_score), agents!agent_id(full_name)')
      .maybeSingle()

    if (error) {
      logger.error('Atama güncellenemedi', { error: error.message, assignmentId })
      return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
    }

    logger.info('Atama güncellendi', { assignmentId, status: parsed.status })

    // COMPLETED ya da CANCELLED durumlarında kilidi serbest bırak
    if (parsed.status === 'COMPLETED' || parsed.status === 'CANCELLED') {
      await releaseLock(assignmentId)
    }

    if (existing.lead_id) {
      await logLeadActivity({
        leadId: existing.lead_id,
        activityType: 'ASSIGNMENT_UPDATED',
        description: `Atama durumu ${existing.status} → ${parsed.status ?? existing.status} olarak güncellendi`,
        agentId: existing.agent_id,
        oldValue: existing.status,
        newValue: parsed.status ?? existing.status,
      })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Assignments PATCH hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
