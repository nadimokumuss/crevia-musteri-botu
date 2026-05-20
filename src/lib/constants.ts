/**
 * Sabit değerler
 */

import type { DayType, WeeklySchedule } from '@/types/schedule'

/** Haftalık takvim — hafta ici arama, hafta sonu tatil */
export const WEEKLY_SCHEDULE: WeeklySchedule = {
  monday: 'REMOTE',
  tuesday: 'REMOTE',
  wednesday: 'REMOTE',
  thursday: 'REMOTE',
  friday: 'REMOTE',
  saturday: 'OFF',
  sunday: 'OFF',
}

/** Gün indeksinden (0=Pazar) gün tipine eşleme — Pzt-Cum hepsi REMOTE */
export const DAY_INDEX_TO_TYPE: Record<number, DayType> = {
  0: 'OFF',      // Pazar
  1: 'REMOTE',   // Pazartesi
  2: 'REMOTE',   // Salı
  3: 'REMOTE',   // Çarşamba
  4: 'REMOTE',   // Perşembe
  5: 'REMOTE',   // Cuma
  6: 'OFF',      // Cumartesi
}

/** Puanlama eşik değerleri (4-sutunlu sistem) */
export const SCORE_THRESHOLDS = {
  HIGH_PRIORITY: 65,
  MEDIUM: 40,
  LOW_PRIORITY: 15,
} as const

/** DBSCAN kümeleme varsayılan parametreleri */
export const CLUSTERING_DEFAULTS = {
  EPSILON_METERS: 500,
  MIN_POINTS: 3,
} as const

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Rota optimizasyonu (env'den override edilebilir) */
export const ROUTE_DEFAULTS = {
  MAX_DAILY_STOPS: envInt('ROUTE_MAX_DAILY_STOPS', 15),
  MIN_DAILY_STOPS: envInt('ROUTE_MIN_DAILY_STOPS', 3),
  URBAN_ROAD_FACTOR: envFloat('ROUTE_URBAN_ROAD_FACTOR', 1.3),
  AVERAGE_VISIT_DURATION_MIN: envInt('ROUTE_AVERAGE_VISIT_DURATION_MIN', 30),
} as const

/** Kilit süresi (dakika) — env'den override edilebilir */
export const LOCK_DURATION_MINUTES = envInt('LOCK_DURATION_MINUTES', 30)

/** Legacy saha modulu icin gunluk ziyaret limiti */
export const MAX_DAILY_VISITS = 10

/** Günlük arama hedefi (TELESALES ajanlar için) */
export const DAILY_CALL_TARGET = 35

/** Istanbul merkez koordinatları */
export const ISTANBUL_CENTER = {
  lat: 41.0082,
  lng: 28.9784,
} as const

/** Sabit sektör/kategori listesi */
export const CATEGORIES = [
  'Restoran',
  'Kafe',
  'Güzellik Salonu',
  'Spor Salonu',
  'Otel',
  'Mağaza',
  'Klinik',
  'Diş Hekimi',
  'Emlakçı',
  'Veteriner',
  'Eğitim / Kurs Merkezi',
  'Optik',
  'Müteahhit / İnşaat',
  'Pet Shop',
] as const

/** Winx Club peri listesi */
export const WINX_FAIRIES = [
  { id: 'bloom', name: 'Bloom', image: '/winx/bloom.png', color: '#FF6B35', power: 'Ejderha Ateşi' },
  { id: 'stella', name: 'Stella', image: '/winx/stella.png', color: '#FFD700', power: 'Güneş Işığı' },
  { id: 'flora', name: 'Flora', image: '/winx/flora.png', color: '#FF69B4', power: 'Doğa Büyüsü' },
  { id: 'musa', name: 'Musa', image: '/winx/musa.png', color: '#8B5CF6', power: 'Müzik Dalgası' },
  { id: 'tecna', name: 'Tecna', image: '/winx/tecna.png', color: '#A855F7', power: 'Dijital Kalkan' },
  { id: 'layla', name: 'Layla', image: '/winx/layla.png', color: '#06B6D4', power: 'Morphix Dalgası' },
] as const
