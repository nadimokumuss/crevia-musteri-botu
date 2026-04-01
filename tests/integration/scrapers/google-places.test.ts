import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GooglePlacesAdapter } from '@/infra/scrapers/google-places.adapter'
import { logger } from '@/lib/logger'

// fetch'i mock'la
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.spyOn(logger, 'info').mockImplementation(() => {})
const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

describe('GooglePlacesAdapter', () => {
  let adapter: GooglePlacesAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new GooglePlacesAdapter('test-api-key')
  })

  it('API anahtarı yoksa hata fırlatır', async () => {
    const noKeyAdapter = new GooglePlacesAdapter('')

    await expect(
      noKeyAdapter.search({ districtId: 'test' })
    ).rejects.toThrow('API anahtarı yapılandırılmamış')
  })

  it('isAvailable API anahtarı varsa true döner', async () => {
    expect(await adapter.isAvailable()).toBe(true)
  })

  it('isAvailable API anahtarı yoksa false döner', async () => {
    const noKeyAdapter = new GooglePlacesAdapter('')
    expect(await noKeyAdapter.isAvailable()).toBe(false)
  })

  it('başarılı arama sonuçlarını RawLeadData formatına dönüştürür', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'ChIJ123',
            displayName: { text: 'Test Kafe', languageCode: 'tr' },
            formattedAddress: 'Kadıköy, Istanbul',
            location: { latitude: 40.99, longitude: 29.02 },
            rating: 4.2,
            userRatingCount: 85,
            photos: [{ name: 'photos/1' }, { name: 'photos/2' }],
            businessStatus: 'OPERATIONAL',
            nationalPhoneNumber: '0216 123 4567',
            websiteUri: 'https://testkafe.com',
            types: ['cafe', 'food', 'point_of_interest', 'establishment'],
          },
          {
            id: 'ChIJ456',
            displayName: { text: 'Test Restaurant', languageCode: 'tr' },
            formattedAddress: 'Beşiktaş, Istanbul',
            location: { latitude: 41.04, longitude: 29.00 },
            rating: 3.1,
            userRatingCount: 12,
            businessStatus: 'CLOSED_TEMPORARILY',
            types: ['restaurant', 'food', 'point_of_interest'],
          },
        ],
      }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        nationalPhoneNumber: '0212 555 1234',
        websiteUri: 'https://testrestaurant.com',
      }),
    })

    const result = await adapter.search({ districtId: 'kadikoy', category: 'kafe' })

    expect(result.source).toBe('google-places')
    expect(result.totalFound).toBe(2)
    expect(result.leads).toHaveLength(2)

    // İlk lead kontrolü
    expect(result.leads[0].businessName).toBe('Test Kafe')
    expect(result.leads[0].googlePlaceId).toBe('ChIJ123')
    expect(result.leads[0].googleRating).toBe(4.2)
    expect(result.leads[0].googleReviewCount).toBe(85)
    expect(result.leads[0].googlePhotoCount).toBe(2)
    expect(result.leads[0].googleIsClaimed).toBe(true)
    expect(result.leads[0].lat).toBe(40.99)
    expect(result.leads[0].lng).toBe(29.02)
    expect(result.leads[0].phone).toBe('0216 123 4567')
    expect(result.leads[0].website).toBe('https://testkafe.com')
    expect(result.leads[0].category).toBe('Kafe')

    // İkinci lead - claimed değil, kategori Restoran
    expect(result.leads[1].googleIsClaimed).toBe(false)
    expect(result.leads[1].category).toBe('Restoran')
    expect(result.leads[1].phone).toBe('0212 555 1234')
    expect(result.leads[1].website).toBe('https://testrestaurant.com')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('boş sonuç durumunda boş liste döner', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    const result = await adapter.search({ districtId: 'test' })
    expect(result.leads).toHaveLength(0)
    expect(result.totalFound).toBe(0)
  })

  it('HTTP hatası durumunda ExternalServiceError fırlatır', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    await expect(
      adapter.search({ districtId: 'test' })
    ).rejects.toThrow('HTTP 500')
  })

  it('limit parametresi ile sonuç sayısını sınırlar', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          { id: 'p1', displayName: { text: 'Lead 1' }, location: { latitude: 41, longitude: 29 }, nationalPhoneNumber: '0212 000 0001' },
          { id: 'p2', displayName: { text: 'Lead 2' }, location: { latitude: 41, longitude: 29 }, nationalPhoneNumber: '0212 000 0002' },
          { id: 'p3', displayName: { text: 'Lead 3' }, location: { latitude: 41, longitude: 29 }, nationalPhoneNumber: '0212 000 0003' },
        ],
        nextPageToken: 'token123',
      }),
    })

    const result = await adapter.search({ districtId: 'test', limit: 2 })
    expect(result.totalFound).toBe(2)
    expect(result.leads).toHaveLength(2)
  })

  it('details isteği başarısız olsa da arama sonucunu döndürür', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'detail-fail',
            displayName: { text: 'Sessiz Kafe', languageCode: 'tr' },
            formattedAddress: 'Kadıköy, Istanbul',
            location: { latitude: 40.99, longitude: 29.02 },
            types: ['cafe'],
          },
        ],
      }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await adapter.search({ districtId: 'kadikoy', category: 'kafe' })

    expect(result.totalFound).toBe(1)
    expect(result.leads).toHaveLength(1)
    expect(result.leads[0].businessName).toBe('Sessiz Kafe')
    expect(result.leads[0].phone).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      'Place details alınamadı',
      expect.objectContaining({ placeId: 'detail-fail' })
    )
  })

  it('getPlaceDetails telefon ve website bilgisini döner', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        nationalPhoneNumber: '0212 555 1234',
        websiteUri: 'https://example.com',
      }),
    })

    const details = await adapter.getPlaceDetails('ChIJ123')
    expect(details.phone).toBe('0212 555 1234')
    expect(details.website).toBe('https://example.com')
  })
})
