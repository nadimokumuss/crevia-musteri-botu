import { describe, it, expect } from 'vitest'
import { __test } from '@/core/audit/audit-pipeline'

const { slugifyBusinessName, generateUniqueSlug } = __test

describe('slugifyBusinessName', () => {
  it('Turkce karakterleri transliterate eder', () => {
    expect(slugifyBusinessName('Çiğdem Şahin')).toBe('cigdem-sahin')
  })

  it('bosluk ve ozel karakterleri tireye cevirir', () => {
    expect(slugifyBusinessName('Mavi Cafe & Restoran (Kadikoy)')).toBe('mavi-cafe-restoran-kadikoy')
  })

  it('tum karakterler kucuk harfe donusur', () => {
    expect(slugifyBusinessName('İSTANBUL KEBAP')).toBe('istanbul-kebap')
  })

  it('60 karakter ile sinirlar', () => {
    const long = 'a'.repeat(100)
    expect(slugifyBusinessName(long).length).toBeLessThanOrEqual(60)
  })

  it('bos veya gecersiz girdide fallback', () => {
    expect(slugifyBusinessName('!!!')).toBe('isletme')
    expect(slugifyBusinessName('')).toBe('isletme')
  })

  it('ardisik tireleri tek tireye indirir', () => {
    expect(slugifyBusinessName('Cafe   ---   Bar')).toBe('cafe-bar')
  })
})

describe('generateUniqueSlug', () => {
  it('ilk denemede slug doner (collision yok)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slug = await generateUniqueSlug(supabase as any, 'Mavi Cafe')
    expect(slug).toMatch(/^mavi-cafe-[A-Za-z0-9_-]{6}$/)
  })

  it('collision olursa yeniden dener', async () => {
    let attempt = 0
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              attempt++
              if (attempt === 1) return { data: { id: 'existing' }, error: null }
              return { data: null, error: null }
            },
          }),
        }),
      }),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slug = await generateUniqueSlug(supabase as any, 'Mavi Cafe')
    expect(slug).toMatch(/^mavi-cafe-[A-Za-z0-9_-]{6}$/)
    expect(attempt).toBe(2)
  })

  it('3 collision sonrasi hata firlatir', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'existing' }, error: null }),
          }),
        }),
      }),
    }

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generateUniqueSlug(supabase as any, 'Mavi Cafe')
    ).rejects.toThrow(/collision/)
  })
})
