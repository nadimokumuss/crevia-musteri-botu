import { NextRequest, NextResponse } from 'next/server'
import { createDistrictSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const isActive = searchParams.get('is_active')

    const supabase = createServiceRoleClient()

    let query = supabase
      .from('districts')
      .select('*')
      .order('name', { ascending: true })

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      logger.error('İlçeler getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Districts API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createDistrictSchema.parse(body)

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('districts')
      .insert(parsed)
      .select()
      .single()

    if (error) {
      logger.error('İlçe oluşturulamadı', { error: error.message })
      return NextResponse.json({ error: 'İlçe oluşturulamadı' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    logger.error('Districts POST hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
