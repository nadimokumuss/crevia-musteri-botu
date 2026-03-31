import type { InstagramDiscoverySource } from '@/types/database'

export const INSTAGRAM_DISCOVERY_SOURCE_LABELS: Record<InstagramDiscoverySource, string> = {
  WEBSITE_URL: 'Profil website alanı',
  WEBSITE_HTML: 'Website içindeki link',
  CANDIDATE_VERIFIED: 'Tahmin + doğrulama',
  MANUAL: 'Manuel',
}
