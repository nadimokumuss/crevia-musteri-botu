/**
 * Veritabanı tip tanımları
 *
 * Not: Supabase gen types ile otomatik üretilecek.
 * Bu dosya manuel tip tanımları için kullanılır.
 */

export type AgentRole = 'ADMIN' | 'FIELD_AGENT' | 'TELESALES_AGENT'
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'WON' | 'LOST' | 'SKIP'
export type LeadRecommendation = 'HIGH_PRIORITY' | 'MEDIUM' | 'LOW_PRIORITY' | 'SKIP'
export type AssignmentType = 'VISIT' | 'CALL'
export type AssignmentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type ScrapeJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
export type WeeklyPlanStatus = 'SCRAPING' | 'DISTRIBUTING' | 'COMPLETED' | 'FAILED'

export interface District {
  id: string
  name: string
  lat: number
  lng: number
  polygon: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Agent {
  id: string
  user_id: string | null
  full_name: string
  email: string
  phone: string | null
  role: AgentRole
  base_lat: number | null
  base_lng: number | null
  max_daily_visits: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Lead {
  id: string
  district_id: string | null
  business_name: string
  category: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  lat: number | null
  lng: number | null
  google_place_id: string | null
  google_rating: number | null
  google_review_count: number | null
  google_photo_count: number | null
  google_is_claimed: boolean | null
  google_last_updated: string | null
  google_response_rate: number | null
  ig_username: string | null
  ig_follower_count: number | null
  ig_post_count: number | null
  ig_avg_likes: number | null
  ig_last_post_date: string | null
  ig_has_highlights: boolean | null
  ig_bio_contains_agency: boolean | null
  ig_has_bio_link: boolean | null
  ig_posting_regularity: 'regular' | 'irregular' | 'gaps' | 'dead' | null
  ig_engagement_rate: number | null
  ig_reels_ratio: number | null
  website_speed_score: number | null
  website_is_mobile_friendly: boolean | null
  website_has_404s: boolean | null
  website_has_meta_pixel: boolean | null
  website_has_ga4: boolean | null
  has_active_meta_ads: boolean | null
  email_source: 'website' | 'google' | 'instagram' | 'manual' | null
  need_score: number
  google_sub_score: number
  instagram_sub_score: number
  website_sub_score: number
  marketing_sub_score: number
  recommendation: LeadRecommendation
  status: LeadStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Assignment {
  id: string
  lead_id: string
  agent_id: string
  assignment_type: AssignmentType
  scheduled_date: string
  status: AssignmentStatus
  outcome: string | null
  notes: string | null
  locked_at: string | null
  lock_expires_at: string | null
  locked_by: string | null
  created_at: string
  updated_at: string
}

export interface RouteStop {
  lead_id: string
  order: number
  lat: number
  lng: number
  status: string
  business_name?: string
  phone?: string
  notes?: string
  outcome?: string
  completed_at?: string
}

export interface Route {
  id: string
  agent_id: string
  route_date: string
  stops: RouteStop[]
  total_distance_km: number
  estimated_duration_min: number
  polyline: string | null
  is_optimized: boolean
  created_at: string
  updated_at: string
}

export interface ScrapeJob {
  id: string
  district_id: string | null
  source_adapter: string
  category: string | null
  status: ScrapeJobStatus
  leads_found: number
  leads_new: number
  leads_updated: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  weekly_plan_id: string | null
  created_at: string
  updated_at: string
}

export interface CallList {
  id: string
  agent_id: string
  list_date: string
  items: import('./call').CallListItem[]
  total_items: number
  completed_items: number
  created_at: string
  updated_at: string
}

export interface AgentPreferences {
  id: string
  agent_id: string
  district_ids: string[]
  categories: string[]
  created_at: string
  updated_at: string
}

export interface WeeklyPlan {
  id: string
  week_start: string
  status: WeeklyPlanStatus
  scrape_job_ids: string[]
  total_scrape_jobs: number
  completed_scrape_jobs: number
  distribution_stats: Record<string, unknown> | null
  error_message: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
