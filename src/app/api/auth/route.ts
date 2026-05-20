import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import { setUserRoleSchema } from '@/lib/validators'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    const serviceClient = createServiceRoleClient()
    const { data: callerAgent } = await serviceClient
      .from('agents')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!callerAgent || !callerAgent.is_active || callerAgent.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Bu işlem için yönetici yetkisi gerekli' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const parsed = setUserRoleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
    }

    if (parsed.data.user_id === user.id) {
      return NextResponse.json(
        { error: 'Kendi rolünüzü değiştiremezsiniz' },
        { status: 400 }
      )
    }

    const { error } = await serviceClient.auth.admin.updateUserById(parsed.data.user_id, {
      user_metadata: { role: parsed.data.role },
    })

    if (error) {
      logger.error('Rol güncellenemedi', { error: error.message, user_id: parsed.data.user_id })
      return NextResponse.json({ error: 'Rol güncellenemedi' }, { status: 500 })
    }

    logger.info('Kullanıcı rolü güncellendi', {
      user_id: parsed.data.user_id,
      role: parsed.data.role,
      changed_by: user.id,
    })

    return NextResponse.json({
      message: 'Rol güncellendi',
      user_id: parsed.data.user_id,
      role: parsed.data.role,
    })
  } catch (error) {
    logger.error('Auth API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
