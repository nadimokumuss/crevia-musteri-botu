import { NextResponse } from 'next/server'
import { cleanExpiredLocks } from '@/core/assignment/collision-guard'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Vercel cron secret kontrolü
  const authHeader = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  try {
    const cleared = await cleanExpiredLocks()
    logger.info('Süresi dolmuş kilitler temizlendi', { cleared })
    return NextResponse.json({ success: true, cleared })
  } catch (error) {
    logger.error('Kilit temizleme cron hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
