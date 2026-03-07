/**
 * Öncelik kuyruğu ile arama listesi oluşturucu
 *
 * Telefon günlerinde (Salı/Perşembe) aranacak lead'leri
 * need_score'a göre sıralar ve ajan başına liste oluşturur.
 */

import type { CallListItem } from '@/types/call'

interface LeadForCall {
  id: string
  businessName: string
  phone: string | null
  needScore: number
}

interface CallListOptions {
  maxItems?: number
  minScore?: number
}

/**
 * Bir ajan için arama listesi oluştur
 *
 * @param leads - Aranabilecek lead listesi (henüz atanmamış/aranmamış)
 * @param options - Liste oluşturma seçenekleri
 */
export function generateCallList(
  leads: LeadForCall[],
  options: CallListOptions = {}
): CallListItem[] {
  const { maxItems = 30, minScore = 20 } = options

  // Telefonsuz lead'leri ve minimum puan altındakileri filtrele
  const eligible = leads.filter((l) => l.phone && l.needScore >= minScore)

  // Need score'a göre azalan sıralama (öncelik kuyruğu)
  const sorted = [...eligible].sort((a, b) => b.needScore - a.needScore)

  // Maksimum sayıya göre kes
  const selected = sorted.slice(0, maxItems)

  // CallListItem formatına dönüştür
  return selected.map((lead, index) => ({
    leadId: lead.id,
    order: index + 1,
    businessName: lead.businessName,
    phone: lead.phone,
    needScore: lead.needScore,
    status: 'PENDING' as const,
  }))
}

/**
 * Arama listesindeki tamamlanma yüzdesini hesapla
 */
export function getCompletionRate(items: CallListItem[]): number {
  if (items.length === 0) return 0
  const completed = items.filter((i) => i.status === 'COMPLETED').length
  return Math.round((completed / items.length) * 100)
}

/**
 * Arama listesindeki sıradaki aranacak lead'i bul
 */
export function getNextPendingCall(items: CallListItem[]): CallListItem | null {
  return items.find((i) => i.status === 'PENDING') ?? null
}
