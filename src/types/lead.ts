/**
 * Lead veri tip tanımları (scraper'lar tarafından kullanılır)
 */

export interface RawLeadData {
  businessName: string
  category?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  lat?: number
  lng?: number
  googlePlaceId?: string
  googleRating?: number
  googleReviewCount?: number
  googlePhotoCount?: number
  googleIsClaimed?: boolean
  googleLastUpdated?: string
  igUsername?: string
  igFollowerCount?: number
  igPostCount?: number
  igAvgLikes?: number
  igLastPostDate?: string
  igHasHighlights?: boolean
  igBioContainsAgency?: boolean
  igHasBioLink?: boolean
  igEngagementRate?: number
  igPostingRegularity?: 'regular' | 'irregular' | 'gaps' | 'dead'
}
