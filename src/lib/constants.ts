/**
 * Sabit değerler
 */

import type { DayType, WeeklySchedule } from '@/types/schedule'

/** Haftalık takvim — FIELD ajanlar haftanın 5 günü sahada, TELESALES 5 gün telefonda */
export const WEEKLY_SCHEDULE: WeeklySchedule = {
  monday: 'FIELD',
  tuesday: 'FIELD',
  wednesday: 'FIELD',
  thursday: 'FIELD',
  friday: 'FIELD',
  saturday: 'OFF',
  sunday: 'OFF',
}

/** Gün indeksinden (0=Pazar) gün tipine eşleme — Pzt-Cum hepsi FIELD */
export const DAY_INDEX_TO_TYPE: Record<number, DayType> = {
  0: 'OFF',      // Pazar
  1: 'FIELD',    // Pazartesi
  2: 'FIELD',    // Salı
  3: 'FIELD',    // Çarşamba
  4: 'FIELD',    // Perşembe
  5: 'FIELD',    // Cuma
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

/** Rota optimizasyonu */
export const ROUTE_DEFAULTS = {
  MAX_DAILY_STOPS: 15,
  MIN_DAILY_STOPS: 3,
  URBAN_ROAD_FACTOR: 1.3,
  AVERAGE_VISIT_DURATION_MIN: 30,
} as const

/** Kilit süresi (dakika) */
export const LOCK_DURATION_MINUTES = 30

/** Maksimum günlük ziyaret sayısı (FIELD saha) */
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
  // Yeme-İçme
  'Restoran',
  'Kafe',
  'Pastane / Fırın',

  // Güzellik & Sağlık
  'Güzellik Salonu',
  'Berber',
  'Spor Salonu',
  'Pilates / Yoga Stüdyosu',
  'Klinik',
  'Diş Hekimi',
  'Veteriner',
  'Eczane',
  'Optik',
  'Diyetisyen',
  'Fizyoterapi',

  // Konaklama & Eğlence
  'Otel',
  'Düğün Salonu',
  'Organizasyon',

  // Perakende
  'Mağaza',
  'Pet Shop',
  'Çiçekçi',
  'Mobilyacı',
  'Kırtasiye',

  // Otomotiv
  'Oto Yıkama',
  'Oto Servis',
  'Oto Galeri',

  // Emlak & İnşaat
  'Emlakçı',
  'Müteahhit / İnşaat',
  'Mimarlık Ofisi',
  'İç Mimar',

  // Hizmet
  'Fotoğrafçı',
  'Eğitim / Kurs Merkezi',
  'Kreş',
  'Temizlik Şirketi',
  'Nakliyat',
  'Danışmanlık',
  'Muhasebeci',

  // Dijital
  'Dijital Ajans',
  'E-ticaret',
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
