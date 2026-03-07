import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logLeadActivity } from '@/infra/supabase/log-activity'
import { logger } from '@/lib/logger'
import { updateLeadSchema } from '@/lib/validators'
import { ZodError } from 'zod'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Lead bulunamadı' }, { status: 404 })
      }
      logger.error('Lead getirilemedi', { error: error.message, id })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Lead detail API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Zod ile doğrulama (bilinmeyen alanları reddet)
    const parsed = updateLeadSchema.parse(body)

    const supabase = createServiceRoleClient()

    // Eski değerleri oku (aktivite logu için)
    const { data: existing } = await supabase
      .from('leads')
      .select('status, notes')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('leads')
      .update(parsed)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Lead bulunamadı' }, { status: 404 })
      }
      logger.error('Lead güncellenemedi', { error: error.message, id })
      return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
    }

    // Aktivite logları (fire-and-forget)
    if (parsed.status && existing && parsed.status !== existing.status) {
      logLeadActivity({
        leadId: id,
        activityType: 'STATUS_CHANGE',
        description: `Durum ${existing.status} → ${parsed.status} olarak değiştirildi`,
        oldValue: existing.status,
        newValue: parsed.status,
      })
    }

    if (parsed.notes !== undefined && existing && parsed.notes !== existing.notes) {
      logLeadActivity({
        leadId: id,
        activityType: 'NOTE_ADDED',
        description: 'Not güncellendi',
        oldValue: existing.notes,
        newValue: parsed.notes,
      })
    }

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error.issues },
        { status: 400 }
      )
    }
    logger.error('Lead PATCH hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServiceRoleClient()

    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Lead silinemedi', { error: error.message, id })
      return NextResponse.json({ error: 'Silme başarısız' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Lead DELETE hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
