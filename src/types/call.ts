/**
 * Arama listesi tip tanımları
 */

export interface CallListItem {
  leadId: string
  order: number
  businessName: string
  phone: string | null
  needScore: number
  igUsername?: string | null
  status: 'PENDING' | 'COMPLETED' | 'NO_ANSWER' | 'CALLBACK' | 'INTERESTED' | 'NOT_INTERESTED' | 'WRONG_NUMBER' | 'DEMO'
  outcome?: string
  notes?: string
}
