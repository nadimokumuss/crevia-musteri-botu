import { NextRequest, NextResponse } from 'next/server'
import { upsertAgentPreferencesSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    const supabase = createServiceRoleClient()

    if (agentId) {
      const { data, error } = await supabase
        .from('agent_preferences')
        .select('*')
        .eq('agent_id', agentId)
        .single()

      if (error && error.code !== 'PGRST116') {
        logger.error('Ajan tercihleri getirilemedi', { error: error.message })
        return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
      }

      return NextResponse.json(data ?? { agent_id: agentId, district_ids: [], categories: [] })
    }

    const { data, error } = await supabase
      .from('agent_preferences')
      .select('*')
      .order('created_at')

    if (error) {
      logger.error('Tüm tercihler getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Preferences GET hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = upsertAgentPreferencesSchema.parse(body)

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('agent_preferences')
      .upsert(
        {
          agent_id: parsed.agent_id,
          district_ids: parsed.district_ids,
          categories: parsed.categories,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'agent_id' }
      )
      .select()
      .single()

    if (error) {
      logger.error('Ajan tercihleri kaydedilemedi', { error: error.message })
      return NextResponse.json({ error: 'Tercihler kaydedilemedi' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Preferences PUT hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
