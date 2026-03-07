/**
 * Agnostik ILeadSource arayüzü
 *
 * Tüm scraper adaptörleri bu arayüzü uygular.
 */

import type { RawLeadData } from '@/types/lead'

export interface LeadSourceQuery {
  districtId: string
  districtName?: string
  category?: string
  limit?: number
}

export interface LeadSourceResult {
  leads: RawLeadData[]
  totalFound: number
  source: string
}

export interface ILeadSource {
  readonly name: string
  search(query: LeadSourceQuery): Promise<LeadSourceResult>
  isAvailable(): Promise<boolean>
}
