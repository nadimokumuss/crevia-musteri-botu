/**
 * Zod doğrulama şemaları
 */

import { z } from 'zod'

/** Koordinat doğrulama */
export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/** İlçe oluşturma */
export const createDistrictSchema = z.object({
  name: z.string().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  polygon: z.record(z.string(), z.unknown()).nullable().optional(),
  is_active: z.boolean().optional().default(true),
})

/** Lead oluşturma */
export const createLeadSchema = z.object({
  business_name: z.string().min(1).max(500),
  district_id: z.string().uuid().nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
})

/** Lead güncelleme (PATCH için) */
export const updateLeadSchema = z.object({
  business_name: z.string().min(1).max(500).optional(),
  district_id: z.string().uuid().nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST', 'SKIP']).optional(),
  notes: z.string().max(5000).nullable().optional(),
  recommendation: z.enum(['HIGH_PRIORITY', 'MEDIUM', 'LOW_PRIORITY', 'SKIP']).nullable().optional(),
}).strict() // Bilinmeyen alanları reddet

/** Ajan oluşturma */
export const createAgentSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  phone: z.string().max(20).nullable().optional(),
  role: z.enum(['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT']),
  base_lat: z.number().min(-90).max(90).nullable().optional(),
  base_lng: z.number().min(-180).max(180).nullable().optional(),
  max_daily_visits: z.number().int().min(1).max(50).optional().default(10),
})

/** Atama oluşturma */
export const createAssignmentSchema = z.object({
  lead_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  assignment_type: z.enum(['VISIT', 'CALL']),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/** Atama güncelleme */
export const updateAssignmentSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  outcome: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

/** Rota oluşturma */
export const createRouteSchema = z.object({
  agent_id: z.string().uuid(),
  route_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stops: z.array(z.object({
    lead_id: z.string().uuid(),
    order: z.number().int().min(0),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    status: z.enum(['PENDING', 'COMPLETED']).optional().default('PENDING'),
  })).default([]),
  total_distance_km: z.number().min(0).optional().default(0),
  estimated_duration_min: z.number().int().min(0).optional().default(0),
  is_optimized: z.boolean().optional().default(false),
})

/** Rota optimize isteği */
export const optimizeRouteSchema = z.object({
  agent_id: z.string().uuid(),
  route_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lead_ids: z.array(z.string().uuid()).min(1).max(20),
})

/** Scraper iş başlatma */
export const startScrapeJobSchema = z.object({
  district_id: z.string().uuid(),
  source_adapter: z.enum(['google-places', 'apify', 'instagram']),
  category: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(200).optional(),
})

/** Arama sonucu güncelleme */
export const updateCallOutcomeSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'NO_ANSWER', 'CALLBACK', 'INTERESTED', 'NOT_INTERESTED', 'WRONG_NUMBER', 'DEMO']).optional(),
  outcome: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
})

/** Sayfalama parametreleri */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
})

/** Ajan tercihleri upsert */
export const upsertAgentPreferencesSchema = z.object({
  agent_id: z.string().uuid(),
  district_ids: z.array(z.string().uuid()).max(20),
  categories: z.array(z.string().min(1).max(200)).max(20).default([]),
})

/** Auth role güncelleme */
export const setUserRoleSchema = z.object({
  action: z.literal('set-role'),
  user_id: z.string().uuid(),
  role: z.enum(['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT']),
}).strict()

/** İsteğe bağlı lead ID listesi alan batch işlemleri */
export const optionalLeadIdsSchema = z.object({
  lead_ids: z.array(z.string().uuid()).max(500).optional(),
}).strict()

/** Instagram zenginleştirme batch isteği */
export const enrichInstagramBatchSchema = z.object({
  district_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).strict()

/** Haftalık plan oluşturma */
export const createWeeklyPlanSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Günlük dağıtım */
export const dailyDistributeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  force: z.boolean().optional().default(false),
})
