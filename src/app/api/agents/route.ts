import { NextRequest, NextResponse } from 'next/server'
import { createAgentSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')
    const isActive = searchParams.get('is_active')

    const supabase = createServiceRoleClient()

    let query = supabase.from('agents').select('*')

    if (role) query = query.eq('role', role)
    if (isActive !== null) query = query.eq('is_active', isActive === 'true')

    query = query.order('full_name')

    const { data, error } = await query

    if (error) {
      logger.error('Ajanlar getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    logger.error('Agents GET hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Ajan ID gerekli' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // Önce ajanı bul (user_id varsa Auth'tan da sileceğiz)
    const { data: agent, error: fetchError } = await supabase
      .from('agents')
      .select('id, user_id, email')
      .eq('id', id)
      .single()

    if (fetchError || !agent) {
      return NextResponse.json({ error: 'Ajan bulunamadı' }, { status: 404 })
    }

    // Agents tablosundan sil (CASCADE ile assignments, routes, call_lists de silinir)
    const { error: deleteError } = await supabase
      .from('agents')
      .delete()
      .eq('id', id)

    if (deleteError) {
      logger.error('Ajan silinemedi', { error: deleteError.message, agentId: id })
      return NextResponse.json({ error: 'Ajan silinemedi' }, { status: 500 })
    }

    // Auth kullanıcısı varsa onu da sil
    if (agent.user_id) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(agent.user_id)
      if (authDeleteError) {
        logger.error('Auth kullanıcısı silinemedi', {
          error: authDeleteError.message,
          userId: agent.user_id,
        })
      }
    }

    logger.info('Ajan silindi', { agentId: id, email: agent.email })
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Agents DELETE hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, is_active } = body as { id?: string; is_active?: boolean }

    if (!id || typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'id ve is_active (boolean) gerekli' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('agents')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Ajan durumu güncellenemedi', { error: error.message, agentId: id })
      return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
    }

    logger.info('Ajan durumu güncellendi', { agentId: id, is_active })
    return NextResponse.json(data)
  } catch (error) {
    logger.error('Agents PATCH hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createAgentSchema.parse(body)

    const supabase = createServiceRoleClient()

    // 1. Supabase Auth ile kullanıcı oluştur (şifre ile)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.full_name,
        role: parsed.role,
      },
    })

    if (authError) {
      logger.error('Auth kullanıcı oluşturma hatası', { error: authError.message, email: parsed.email })
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        return NextResponse.json({ error: 'Bu email ile zaten bir hesap var' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Kullanıcı oluşturulamadı' }, { status: 500 })
    }

    const authUserId = authData.user.id

    // 2. Agents tablosuna user_id ile birlikte insert (password hariç)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...agentData } = parsed
    const { data, error } = await supabase
      .from('agents')
      .insert({ ...agentData, user_id: authUserId })
      .select()
      .single()

    if (error) {
      // Rollback: agents insert başarısızsa auth kullanıcısını sil
      logger.error('Ajan insert hatası, auth kullanıcısı siliniyor', {
        error: error.message,
        authUserId,
      })
      await supabase.auth.admin.deleteUser(authUserId)

      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bu email zaten kayıtlı' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Ajan oluşturulamadı' }, { status: 500 })
    }

    // 3. Boş agent_preferences kaydı oluştur (haftalık plan dağıtımına dahil olması için)
    const { error: prefsError } = await supabase
      .from('agent_preferences')
      .insert({ agent_id: data.id, district_ids: [], categories: [] })

    if (prefsError) {
      logger.warn('Ajan tercihleri oluşturulamadı (ajan yine de oluşturuldu)', {
        error: prefsError.message,
        agentId: data.id,
      })
    }

    logger.info('Ajan oluşturuldu', {
      agentId: data.id,
      email: parsed.email,
    })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    logger.error('Agents POST hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
