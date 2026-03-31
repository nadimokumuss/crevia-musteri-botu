import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    const supabase = createServiceRoleClient()

    // Tek sorguda tüm kategorilerin sayısını çek
    const [
      highPriority,
      newRecent,
      contacted,
      visited,
      proposal,
      callback,
      total,
    ] = await Promise.all([
      // Potansiyeli Yüksek
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('recommendation', 'HIGH_PRIORITY')
        .eq('status', 'NEW'),
      // Yeni Eklenen (son 7 gün)
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      // Aranan
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'CONTACTED'),
      // Tamamlanan aramalar (assignments tablosundan)
      supabase
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .eq('assignment_type', 'CALL')
        .eq('status', 'COMPLETED'),
      // Teklif Bırakılan
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PROPOSAL'),
      // Geri Aranacak (call_lists items status=CALLBACK)
      supabase
        .from('call_lists')
        .select('items'),
      // Toplam
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true }),
    ])

    // Callback sayısını hesapla (JSONB items içinden)
    let callbackCount = 0
    if (callback.data) {
      for (const list of callback.data) {
        const items = list.items as { status: string }[]
        if (Array.isArray(items)) {
          callbackCount += items.filter((i) => i.status === 'CALLBACK').length
        }
      }
    }

    return NextResponse.json({
      high_priority: highPriority.count ?? 0,
      new_recent: newRecent.count ?? 0,
      contacted: contacted.count ?? 0,
      visited: visited.count ?? 0,
      proposal: proposal.count ?? 0,
      callback: callbackCount,
      total: total.count ?? 0,
    })
  } catch (error) {
    logger.error('Categories API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
