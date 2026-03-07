import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    const supabase = createServiceRoleClient()

    if (action === 'set-role') {
      const { user_id, role } = body
      if (!user_id || !role) {
        return NextResponse.json({ error: 'user_id ve role gerekli' }, { status: 400 })
      }
      if (!['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT'].includes(role)) {
        return NextResponse.json({ error: 'Geçersiz rol' }, { status: 400 })
      }

      const { error } = await supabase.auth.admin.updateUserById(user_id, {
        user_metadata: { role },
      })

      if (error) {
        logger.error('Rol güncellenemedi', { error: error.message, user_id })
        return NextResponse.json({ error: 'Rol güncellenemedi' }, { status: 500 })
      }

      logger.info('Kullanıcı rolü güncellendi', { user_id, role })
      return NextResponse.json({ message: 'Rol güncellendi', user_id, role })
    }

    return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 })
  } catch (error) {
    logger.error('Auth API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
