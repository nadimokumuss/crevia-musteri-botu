import { describe, it, expect } from 'vitest'
import {
  normalizeTurkish,
  extractInstagramFromUrl,
  normalizeInstagramUsername,
  getInstagramProfileUrl,
  extractInstagramFromHtml,
  guessInstagramCandidates,
  verifyInstagramMatch,
  extractWebsiteDomain,
} from '@/lib/instagram-utils'

describe('normalizeTurkish', () => {
  it('Türkçe karakterleri ASCII karşılıklarına dönüştürür', () => {
    expect(normalizeTurkish('Çağdaş')).toBe('cagdas')
    expect(normalizeTurkish('Güneşli')).toBe('gunesli')
    expect(normalizeTurkish('Şişli')).toBe('sisli')
    expect(normalizeTurkish('İstanbul')).toBe('istanbul')
    expect(normalizeTurkish('Ömer')).toBe('omer')
    expect(normalizeTurkish('Üsküdar')).toBe('uskudar')
  })

  it('özel karakterleri temizler', () => {
    expect(normalizeTurkish('Kafe & Bar')).toBe('kafebar')
    expect(normalizeTurkish('Salon - 34')).toBe('salon34')
  })

  it('küçük harfe dönüştürür', () => {
    expect(normalizeTurkish('BÜYÜK HARF')).toBe('buyukharf')
  })
})

describe('extractInstagramFromUrl', () => {
  it('Instagram URL\'sinden username çıkarır', () => {
    expect(extractInstagramFromUrl('https://instagram.com/sahanrestoran')).toBe('sahanrestoran')
    expect(extractInstagramFromUrl('https://www.instagram.com/sahanrestoran')).toBe('sahanrestoran')
    expect(extractInstagramFromUrl('https://www.instagram.com/sahanrestoran/')).toBe('sahanrestoran')
    expect(extractInstagramFromUrl('http://instagram.com/kafe_istanbul')).toBe('kafe_istanbul')
  })

  it('Instagram olmayan URL için null döner', () => {
    expect(extractInstagramFromUrl('https://sahanrestoran.com')).toBeNull()
    expect(extractInstagramFromUrl('https://facebook.com/sahanrestoran')).toBeNull()
    expect(extractInstagramFromUrl('https://google.com')).toBeNull()
  })

  it('sistem yollarını filtreler', () => {
    expect(extractInstagramFromUrl('https://instagram.com/p/ABC123')).toBeNull()
    expect(extractInstagramFromUrl('https://instagram.com/reel/ABC123')).toBeNull()
    expect(extractInstagramFromUrl('https://instagram.com/explore/tags')).toBeNull()
    expect(extractInstagramFromUrl('https://instagram.com/stories/user')).toBeNull()
    expect(extractInstagramFromUrl('https://instagram.com/accounts/login')).toBeNull()
  })

  it('http:// olmadan çalışır', () => {
    expect(extractInstagramFromUrl('instagram.com/sahanrestoran')).toBe('sahanrestoran')
  })

  it('geçersiz URL için null döner', () => {
    expect(extractInstagramFromUrl('')).toBeNull()
    expect(extractInstagramFromUrl('not a url at all')).toBeNull()
  })

  it('path olmayan Instagram URL\'si için null döner', () => {
    expect(extractInstagramFromUrl('https://instagram.com')).toBeNull()
    expect(extractInstagramFromUrl('https://instagram.com/')).toBeNull()
  })
})

describe('normalizeInstagramUsername', () => {
  it('plain username ve @ prefixli değeri normalize eder', () => {
    expect(normalizeInstagramUsername('modacafe')).toBe('modacafe')
    expect(normalizeInstagramUsername('@ModaCafe')).toBe('modacafe')
  })

  it('instagram url değerlerini normalize eder', () => {
    expect(normalizeInstagramUsername('https://instagram.com/modacafe/')).toBe('modacafe')
    expect(normalizeInstagramUsername('instagram.com/modacafe')).toBe('modacafe')
  })

  it('geçersiz değerleri null yapar', () => {
    expect(normalizeInstagramUsername('')).toBeNull()
    expect(normalizeInstagramUsername('moda cafe')).toBeNull()
    expect(normalizeInstagramUsername('https://example.com/modacafe')).toBeNull()
  })
})

describe('getInstagramProfileUrl', () => {
  it('normalize edilmiş profil URLsi üretir', () => {
    expect(getInstagramProfileUrl('@ModaCafe')).toBe('https://instagram.com/modacafe')
    expect(getInstagramProfileUrl('https://instagram.com/modacafe/')).toBe('https://instagram.com/modacafe')
  })

  it('geçersiz değerlerde null döner', () => {
    expect(getInstagramProfileUrl('not valid')).toBeNull()
  })
})

describe('extractInstagramFromHtml', () => {
  it('HTML\'deki Instagram linkini bulur', () => {
    const html = '<a href="https://instagram.com/sahanrestoran">Instagram</a>'
    expect(extractInstagramFromHtml(html)).toBe('sahanrestoran')
  })

  it('www prefix\'li linki bulur', () => {
    const html = '<a href="https://www.instagram.com/kafe_34">Follow us</a>'
    expect(extractInstagramFromHtml(html)).toBe('kafe_34')
  })

  it('/p/ ve /reel/ gibi yolları filtreler', () => {
    const html = `
      <a href="https://instagram.com/p/ABC123">Post</a>
      <a href="https://instagram.com/reel/DEF456">Reel</a>
      <a href="https://instagram.com/explore/tags">Explore</a>
      <a href="https://instagram.com/myprofile">Profile</a>
    `
    expect(extractInstagramFromHtml(html)).toBe('myprofile')
  })

  it('Instagram linki yoksa null döner', () => {
    const html = '<a href="https://facebook.com/mypage">Facebook</a>'
    expect(extractInstagramFromHtml(html)).toBeNull()
  })

  it('ilk geçerli username\'i döner', () => {
    const html = `
      <a href="https://instagram.com/p/post1">Post</a>
      <a href="https://instagram.com/firstprofile">First</a>
      <a href="https://instagram.com/secondprofile">Second</a>
    `
    expect(extractInstagramFromHtml(html)).toBe('firstprofile')
  })

  it('boş HTML için null döner', () => {
    expect(extractInstagramFromHtml('')).toBeNull()
  })
})

describe('guessInstagramCandidates', () => {
  it('website domain\'ini ilk aday olarak döner', () => {
    const lead = {
      business_name: 'Şahan Restoran',
      category: 'Restoran',
      website: 'https://www.sahanrestoran.com',
    }
    const candidates = guessInstagramCandidates(lead)
    expect(candidates[0]).toBe('sahanrestoran')
  })

  it('kategori ekleriyle adaylar üretir', () => {
    const lead = {
      business_name: 'Şahan',
      category: 'Restoran',
      website: null,
    }
    const candidates = guessInstagramCandidates(lead)
    expect(candidates).toContain('sahanrestoran')
    expect(candidates).toContain('sahanrestaurant')
    expect(candidates).toContain('sahan')
  })

  it('çok kelimeli isimler için ilk kelime + kategori eki üretir', () => {
    const lead = {
      business_name: 'Güzel Kafe İstanbul',
      category: 'Kafe',
      website: null,
    }
    const candidates = guessInstagramCandidates(lead)
    expect(candidates).toContain('guzelkafeistanbulkafe')
    expect(candidates).toContain('guzelkafe')
    expect(candidates).toContain('guzelkafeistanbul')
    expect(candidates).toContain('guzel')
  })

  it('Türkçe karakterleri normalize eder', () => {
    const lead = {
      business_name: 'Güneşli Çiçekçi',
      category: null,
      website: null,
    }
    const candidates = guessInstagramCandidates(lead)
    expect(candidates).toContain('guneslicicekci')
  })

  it('30 karakter limitini uygular', () => {
    const lead = {
      business_name: 'Bu Çok Uzun Bir İşletme Adı Ve Otuz Karakteri Kesinlikle Geçecek',
      category: null,
      website: null,
    }
    const candidates = guessInstagramCandidates(lead)
    for (const c of candidates) {
      expect(c.length).toBeLessThanOrEqual(30)
    }
  })

  it('3 karakterden kısa adayları filtreler', () => {
    const lead = {
      business_name: 'AB',
      category: null,
      website: null,
    }
    const candidates = guessInstagramCandidates(lead)
    for (const c of candidates) {
      expect(c.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('tekrar eden adayları filtreler', () => {
    const lead = {
      business_name: 'Sahan',
      category: 'Restoran',
      website: 'https://sahan.com',
    }
    const candidates = guessInstagramCandidates(lead)
    const unique = new Set(candidates)
    expect(unique.size).toBe(candidates.length)
  })
})

describe('verifyInstagramMatch', () => {
  const businessName = 'Şahan Restoran'

  it('externalUrl domain eşleşmesinde KABUL eder', () => {
    const profile = {
      username: 'sahanrestoran',
      externalUrl: 'https://www.sahanrestoran.com',
    }
    const context = { websiteDomain: 'sahanrestoran.com' }
    expect(verifyInstagramMatch(profile, businessName, context)).toBe(true)
  })

  it('bio\'da işletme adı eşleşmesinde KABUL eder', () => {
    const profile = {
      username: 'sahanrest',
      biography: 'Şahan Restoran - 2010\'dan beri hizmetinizde',
    }
    const context = {}
    expect(verifyInstagramMatch(profile, businessName, context)).toBe(true)
  })

  it('business account + fullName eşleşmesinde KABUL eder', () => {
    const profile = {
      username: 'sahanrest',
      fullName: 'Şahan Restoran Istanbul',
      isBusinessAccount: true,
    }
    const context = {}
    expect(verifyInstagramMatch(profile, businessName, context)).toBe(true)
  })

  it('kişisel hesapta fullName eşleşmesinde RED eder', () => {
    const profile = {
      username: 'sahanrest',
      fullName: 'Şahan Restoran',
      isBusinessAccount: false,
    }
    const context = {}
    expect(verifyInstagramMatch(profile, businessName, context)).toBe(false)
  })

  it('hiçbir kural eşleşmezse RED eder', () => {
    const profile = {
      username: 'randomuser',
      fullName: 'Ahmet Yılmaz',
      biography: 'Kişisel hesap',
    }
    const context = { websiteDomain: 'sahanrestoran.com' }
    expect(verifyInstagramMatch(profile, businessName, context)).toBe(false)
  })

  it('boş profil verisinde RED eder', () => {
    const profile = {
      username: 'sahanrest',
    }
    const context = {}
    expect(verifyInstagramMatch(profile, businessName, context)).toBe(false)
  })

  it('www prefix farkını tolere eder', () => {
    const profile = {
      username: 'sahan',
      externalUrl: 'https://sahanrestoran.com',
    }
    const context = { websiteDomain: 'www.sahanrestoran.com' }
    expect(verifyInstagramMatch(profile, businessName, context)).toBe(true)
  })
})

describe('extractWebsiteDomain', () => {
  it('URL\'den domain çıkarır', () => {
    expect(extractWebsiteDomain('https://www.sahanrestoran.com')).toBe('sahanrestoran.com')
    expect(extractWebsiteDomain('http://sahanrestoran.com/about')).toBe('sahanrestoran.com')
  })

  it('null/undefined için null döner', () => {
    expect(extractWebsiteDomain(null)).toBeNull()
    expect(extractWebsiteDomain(undefined)).toBeNull()
  })

  it('http:// olmadan çalışır', () => {
    expect(extractWebsiteDomain('sahanrestoran.com')).toBe('sahanrestoran.com')
  })
})
