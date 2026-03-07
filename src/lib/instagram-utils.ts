/**
 * Instagram profil bulma ve doğrulama yardımcı fonksiyonları
 *
 * 3 katmanlı strateji:
 * 1. Website HTML'den Instagram linki çıkar
 * 2. websiteUri'nin doğrudan Instagram URL'si olup olmadığını kontrol et
 * 3. Aday üretimi + Apify doğrulama
 */

import type { Lead } from '@/types/database'

/** Türkçe özel karakterleri ASCII karşılıklarına dönüştür */
export function normalizeTurkish(str: string): string {
  return str
    .toLowerCase()
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .replace(/[âÂ]/g, 'a')
    .replace(/[îÎ]/g, 'i')
    .replace(/[ûÛ]/g, 'u')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * URL'nin instagram.com linki olup olmadığını kontrol et, username çıkar.
 * "https://instagram.com/sahanrestoran" → "sahanrestoran"
 * "https://www.instagram.com/sahanrestoran/" → "sahanrestoran"
 * "https://sahanrestoran.com" → null
 */
export function extractInstagramFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    const hostname = parsed.hostname.replace(/^www\./, '')
    if (hostname !== 'instagram.com') return null

    const pathParts = parsed.pathname.split('/').filter(Boolean)
    if (pathParts.length === 0) return null

    const username = pathParts[0]
    // Instagram sistem yollarını filtrele
    const systemPaths = ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'about', 'legal', 'developer']
    if (systemPaths.includes(username)) return null

    if (username.length < 1 || username.length > 30) return null
    return username.toLowerCase()
  } catch {
    return null
  }
}

/**
 * HTML içeriğinden Instagram linklerini bul.
 * Ortak yanlışları filtreler: /p/, /reel/, /explore/ vb.
 */
export function extractInstagramFromHtml(html: string): string | null {
  const pattern = /instagram\.com\/([a-zA-Z0-9_.]+)/g
  const systemPaths = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'about', 'legal', 'developer'])

  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    const username = match[1]
    if (!systemPaths.has(username) && username.length >= 2 && username.length <= 30) {
      return username.toLowerCase()
    }
  }

  return null
}

/** Kategori → olası Instagram eki haritası */
const CATEGORY_SUFFIX_MAP: Record<string, string[]> = {
  restoran: ['restoran', 'restaurant'],
  restaurant: ['restoran', 'restaurant'],
  kafe: ['kafe', 'cafe', 'coffee'],
  cafe: ['kafe', 'cafe', 'coffee'],
  kahve: ['kafe', 'cafe', 'coffee'],
  'güzellik salonu': ['guzellik', 'beauty', 'kuafor'],
  kuaför: ['guzellik', 'beauty', 'kuafor'],
  'spor salonu': ['spor', 'gym', 'fitness'],
  otel: ['otel', 'hotel'],
  hotel: ['otel', 'hotel'],
  mağaza: ['magaza', 'shop'],
  klinik: ['klinik', 'clinic'],
  'diş hekimi': ['dishekimi', 'dental'],
  avukat: ['hukuk', 'avukat'],
  emlakçı: ['emlak'],
}

/** Kategoriden ek listesi çıkar */
function getCategorySuffixes(category: string | null | undefined): string[] {
  if (!category) return []
  const lower = category.toLowerCase()
  for (const [key, suffixes] of Object.entries(CATEGORY_SUFFIX_MAP)) {
    if (lower.includes(key)) return suffixes
  }
  return []
}

/**
 * Lead bilgilerinden Instagram aday kullanıcı adı listesi üret.
 * Öncelik sırasına göre:
 * 1. Website domain ("sahanrestoran.com" → "sahanrestoran")
 * 2. Tam isim + kategori eki
 * 3. İlk kelime + kategori eki (çok kelimeli isimler için)
 * 4. Tam isim (fallback)
 * 5. İlk kelime (son çare)
 */
export function guessInstagramCandidates(lead: Pick<Lead, 'business_name' | 'category' | 'website'>): string[] {
  const candidates: string[] = []
  const seen = new Set<string>()

  const addCandidate = (c: string) => {
    const trimmed = c.trim()
    if (trimmed.length >= 3 && trimmed.length <= 30 && !seen.has(trimmed)) {
      seen.add(trimmed)
      candidates.push(trimmed)
    }
  }

  // 1. Website domain
  if (lead.website) {
    try {
      const url = new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`)
      const hostname = url.hostname.replace(/^www\./, '')
      const domain = hostname.split('.')[0]
      if (domain) addCandidate(domain.toLowerCase())
    } catch {
      // URL parse hatası, devam et
    }
  }

  const fullName = normalizeTurkish(lead.business_name)
  const words = lead.business_name.split(/\s+/).filter(Boolean)
  const firstWord = words.length > 0 ? normalizeTurkish(words[0]) : ''
  const suffixes = getCategorySuffixes(lead.category)

  // 2. Tam isim + kategori eki
  for (const suffix of suffixes) {
    addCandidate(fullName + suffix)
  }

  // 3. İlk kelime + kategori eki (çok kelimeli isimler için)
  if (words.length > 1 && firstWord) {
    for (const suffix of suffixes) {
      addCandidate(firstWord + suffix)
    }
  }

  // 4. Tam isim (fallback)
  addCandidate(fullName)

  // 5. İlk kelime (son çare)
  if (firstWord && firstWord !== fullName) {
    addCandidate(firstWord)
  }

  return candidates
}

/** Apify profil verisi doğrulama bağlamı */
export interface VerifyContext {
  websiteDomain?: string | null
}

/** Apify profil verisi (doğrulama için gerekli alanlar) */
export interface VerifiableProfile {
  username: string
  fullName?: string
  biography?: string
  isBusinessAccount?: boolean
  externalUrl?: string
}

/**
 * Apify profil verisini işletme ile eşleştir.
 * Kurallar:
 * 1. externalUrl domain == lead website domain → KABUL
 * 2. Bio'da işletme adı geçiyor → KABUL
 * 3. isBusinessAccount=true VE fullName işletme adını içeriyor → KABUL
 * 4. Hiçbiri → RED
 */
export function verifyInstagramMatch(
  profile: VerifiableProfile,
  businessName: string,
  context: VerifyContext
): boolean {
  const normalizedBusiness = normalizeTurkish(businessName)

  // 1. externalUrl domain eşleşmesi
  if (profile.externalUrl && context.websiteDomain) {
    try {
      const profileUrl = new URL(
        profile.externalUrl.startsWith('http') ? profile.externalUrl : `https://${profile.externalUrl}`
      )
      const profileDomain = profileUrl.hostname.replace(/^www\./, '').toLowerCase()
      const leadDomain = context.websiteDomain.replace(/^www\./, '').toLowerCase()
      if (profileDomain === leadDomain) return true
    } catch {
      // URL parse hatası, devam et
    }
  }

  // 2. Bio'da işletme adı kontrolü
  if (profile.biography) {
    const normalizedBio = normalizeTurkish(profile.biography)
    if (normalizedBio.includes(normalizedBusiness)) return true
  }

  // 3. Business account + fullName eşleşmesi
  if (profile.isBusinessAccount && profile.fullName) {
    const normalizedFullName = normalizeTurkish(profile.fullName)
    if (
      normalizedFullName.includes(normalizedBusiness) ||
      normalizedBusiness.includes(normalizedFullName)
    ) {
      return true
    }
  }

  return false
}

/**
 * Lead'in website domain'ini çıkar (doğrulama bağlamı için)
 */
export function extractWebsiteDomain(website: string | null | undefined): string | null {
  if (!website) return null
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}
