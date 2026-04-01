import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import { setUserRoleSchema } from '@/lib/validators'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = setUserRoleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { error } = await supabase.auth.admin.updateUserById(parsed.data.user_id, {
      user_metadata: { role: parsed.data.role },
    })

    if (error) {
      logger.error('Rol güncellenemedi', { error: error.message, user_id: parsed.data.user_id })
      return NextResponse.json({ error: 'Rol güncellenemedi' }, { status: 500 })
    }

    logger.info('Kullanıcı rolü güncellendi', {
      user_id: parsed.data.user_id,
      role: parsed.data.role,
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
