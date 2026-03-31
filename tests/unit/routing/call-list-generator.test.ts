import { describe, it, expect } from 'vitest'
import {
  generateCallList,
  getCompletionRate,
  getNextPendingCall,
  selectCallLeadCandidates,
} from '@/core/routing/call-list-generator'

describe('generateCallList', () => {
  const mockLeads = [
    { id: '1', businessName: 'Kafe A', phone: '555-0001', needScore: 85 },
    { id: '2', businessName: 'Restoran B', phone: '555-0002', needScore: 45 },
    { id: '3', businessName: 'Salon C', phone: '555-0003', needScore: 72 },
    { id: '4', businessName: 'Otel D', phone: '555-0004', needScore: 15 },
    { id: '5', businessName: 'Mağaza E', phone: '555-0005', needScore: 30 },
  ]

  it('need_score azalan sırada sıralar', () => {
    const list = generateCallList(mockLeads)

    expect(list[0].needScore).toBe(85)
    expect(list[1].needScore).toBe(72)
    expect(list[2].needScore).toBe(45)
    expect(list[3].needScore).toBe(30)
  })

  it('minimum skor altındaki lead\'leri filtreler', () => {
    const list = generateCallList(mockLeads, { minScore: 20 })

    // needScore=15 olan hariç
    expect(list).toHaveLength(4)
    expect(list.every((i) => i.needScore >= 20)).toBe(true)
  })

  it('maxItems ile sonuç sayısını sınırlar', () => {
    const list = generateCallList(mockLeads, { maxItems: 2 })

    expect(list).toHaveLength(2)
    // En yüksek puanlı 2 lead
    expect(list[0].needScore).toBe(85)
    expect(list[1].needScore).toBe(72)
  })

  it('sıra numaraları 1\'den başlar', () => {
    const list = generateCallList(mockLeads)

    expect(list[0].order).toBe(1)
    expect(list[1].order).toBe(2)
  })

  it('tüm item\'lar PENDING durumunda başlar', () => {
    const list = generateCallList(mockLeads)

    expect(list.every((i) => i.status === 'PENDING')).toBe(true)
  })

  it('telefon numarası olmayan lead\'leri filtreler', () => {
    const leads = [
      { id: '1', businessName: 'A', phone: '555-0001', needScore: 80 },
      { id: '2', businessName: 'B', phone: null, needScore: 90 },
      { id: '3', businessName: 'C', phone: '555-0003', needScore: 70 },
    ]
    const list = generateCallList(leads)

    expect(list).toHaveLength(2)
    expect(list.every((i) => i.phone !== null)).toBe(true)
  })

  it('boş lead listesi için boş liste döner', () => {
    expect(generateCallList([])).toHaveLength(0)
  })
})

describe('getCompletionRate', () => {
  it('boş liste için 0 döner', () => {
    expect(getCompletionRate([])).toBe(0)
  })

  it('tamamlanma oranını doğru hesaplar', () => {
    const items = [
      { leadId: '1', order: 1, businessName: 'A', phone: null, needScore: 50, status: 'COMPLETED' as const },
      { leadId: '2', order: 2, businessName: 'B', phone: null, needScore: 40, status: 'PENDING' as const },
      { leadId: '3', order: 3, businessName: 'C', phone: null, needScore: 30, status: 'COMPLETED' as const },
      { leadId: '4', order: 4, businessName: 'D', phone: null, needScore: 20, status: 'NO_ANSWER' as const },
    ]

    expect(getCompletionRate(items)).toBe(50)
  })
})

describe('getNextPendingCall', () => {
  it('ilk PENDING item\'ı döner', () => {
    const items = [
      { leadId: '1', order: 1, businessName: 'A', phone: null, needScore: 50, status: 'COMPLETED' as const },
      { leadId: '2', order: 2, businessName: 'B', phone: '555', needScore: 40, status: 'PENDING' as const },
      { leadId: '3', order: 3, businessName: 'C', phone: null, needScore: 30, status: 'PENDING' as const },
    ]

    const next = getNextPendingCall(items)
    expect(next?.leadId).toBe('2')
  })

  it('PENDING item yoksa null döner', () => {
    const items = [
      { leadId: '1', order: 1, businessName: 'A', phone: null, needScore: 50, status: 'COMPLETED' as const },
    ]

    expect(getNextPendingCall(items)).toBeNull()
  })
})

describe('selectCallLeadCandidates', () => {
  const leads = [
    { id: '1', businessName: 'A', phone: '555-0001', needScore: 80, districtId: 'kadikoy', category: 'Kafe' },
    { id: '2', businessName: 'B', phone: '555-0002', needScore: 70, districtId: 'besiktas', category: 'Restoran' },
    { id: '3', businessName: 'C', phone: '555-0003', needScore: 60, districtId: 'kadikoy', category: 'Restoran' },
  ]

  it('daha once atanmis leadleri hariç tutar', () => {
    const selected = selectCallLeadCandidates(leads, {
      excludedLeadIds: ['1'],
      maxItems: 5,
    })

    expect(selected.map((lead) => lead.id)).toEqual(['2', '3'])
  })

  it('ajan ilce ve kategori tercihlerine gore filtreler', () => {
    const selected = selectCallLeadCandidates(leads, {
      districtIds: ['kadikoy'],
      categories: ['Restoran'],
      maxItems: 5,
    })

    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('3')
  })
})
