/**
 * Öncelik kuyruğu ile arama listesi oluşturucu
 *
 * Telefon gunlerinde aranacak lead'leri
 * need_score'a göre sıralar ve ajan başına liste oluşturur.
 */

import type { CallListItem } from '@/types/call'

interface LeadForCall {
  id: string
  businessName: string
  phone: string | null
  needScore: number
  districtId?: string | null
  category?: string | null
  igUsername?: string | null
}

interface CallListOptions {
  maxItems?: number
  minScore?: number
  excludedLeadIds?: Iterable<string>
  districtIds?: string[]
  categories?: string[]
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
  const selected = selectCallLeadCandidates(leads, options)

  // CallListItem formatına dönüştür
  return selected.map((lead, index) => ({
    leadId: lead.id,
    order: index + 1,
    businessName: lead.businessName,
    phone: lead.phone,
    needScore: lead.needScore,
    igUsername: lead.igUsername,
    status: 'PENDING' as const,
  }))
}

export function selectCallLeadCandidates(
  leads: LeadForCall[],
  options: CallListOptions = {}
): LeadForCall[] {
  const {
    maxItems = 30,
    minScore = 20,
    excludedLeadIds = [],
    districtIds = [],
    categories = [],
  } = options

  const excludedSet = new Set(excludedLeadIds)
  const hasDistrictFilter = districtIds.length > 0
  const hasCategoryFilter = categories.length > 0

  return [...leads]
    .filter((lead) => {
      if (!lead.phone || lead.needScore < minScore) return false
      if (excludedSet.has(lead.id)) return false
      if (hasDistrictFilter && (!lead.districtId || !districtIds.includes(lead.districtId))) {
        return false
      }
      if (hasCategoryFilter && (!lead.category || !categories.includes(lead.category))) {
        return false
      }
      return true
    })
    .sort((a, b) => b.needScore - a.needScore)
    .slice(0, maxItems)
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
