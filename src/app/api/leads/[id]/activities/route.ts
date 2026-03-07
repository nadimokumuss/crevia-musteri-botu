import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('lead_activities')
      .select('*, agents(full_name)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('Aktiviteler getirilemedi', { error: error.message, leadId: id })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Activities API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
