import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApifyAdapter } from '@/infra/scrapers/apify.adapter'

describe('ApifyAdapter — locationQuery', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env.APIFY_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('locationQuery parametresine ilçe adını koyar (UUID değil)', async () => {
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      // 1. çağrı: actor başlat — body'yi inceleyelim
      if (url.includes('/runs?')) {
        return new Response(
          JSON.stringify({ data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' } }),
          { status: 200 }
        )
      }
      // 2. çağrı: poll
      if (url.includes('/actor-runs/')) {
        return new Response(
          JSON.stringify({ data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' } }),
          { status: 200 }
        )
      }
      // 3. çağrı: dataset items
      return new Response(JSON.stringify([]), { status: 200 })
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new ApifyAdapter()
    await adapter.search({
      districtId: 'aaaa-bbbb-cccc-dddd',
      districtName: 'Kadıköy',
      category: 'Restoran',
      limit: 10,
    })

    // İlk fetch çağrısının body'sini kontrol et
    const firstCall = fetchSpy.mock.calls[0]
    const init = firstCall[1] as RequestInit
    const body = JSON.parse(init.body as string)

    expect(body.locationQuery).toContain('Kadıköy')
    expect(body.locationQuery).not.toBe('aaaa-bbbb-cccc-dddd')
    expect(body.searchStringsArray).toEqual(['Restoran'])
  })

  it('districtName yoksa Istanbul fallback', async () => {
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/datasets/')) {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Response(
        JSON.stringify({ data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' } }),
        { status: 200 }
      )
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const adapter = new ApifyAdapter()
    await adapter.search({
      districtId: 'aaaa-bbbb',
      category: 'Kafe',
      limit: 5,
    })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.locationQuery).toBe('İstanbul, Türkiye')
  })
})
