import { describe, it, expect } from 'vitest'
import {
  auditSynthesisSchema,
  strengthSchema,
  gapSchema,
  submitAuditToolInputSchema,
} from '@/lib/audit-schemas'

describe('audit-schemas', () => {
  const validStrength = { area: 'Yorum yaniti', note: '12 yorumun 9unda sahip yanit verilmis' }
  const validGap = {
    area: 'Web sitesi hizi',
    severity: 'high' as const,
    note: 'Mobile speed score 38/100',
    talking_point: 'Mobil hiziniz musteri kaybi yaratabilir; 1 hafta icinde 80+e cikarabiliriz.',
  }

  const validSynthesis = {
    narrative:
      'Bu isletme orta-segment bir konsept restoran. Online varlik dagilimi: GBP populer, IG zayif, web yok.',
    strengths: [validStrength],
    gaps: [validGap],
    tier: 'B' as const,
    phone_script:
      'Merhaba, ben Crevia satis ekibinden. Profilinizi inceledim; mobil hiziniz musteri yitirme riski tasiyor. 10 dakika gorusebilir miyiz?',
    outreach_email_subject: 'Crevia: hizli mobil iyilestirme tavsiyesi',
    outreach_email_body:
      'Merhaba, isletmenizin GBP profilini ve web sitenizi inceledim. Mobil hiz skorunuz dusuk ve bu musteri kaybi yaratiyor. Bir hafta icinde ciddi iyilestirme yapabiliriz. Kisa bir Zoom gorusmesi ayirabilir miyiz?',
  }

  it('valid synthesis kabul edilir', () => {
    const result = auditSynthesisSchema.safeParse(validSynthesis)
    expect(result.success).toBe(true)
  })

  it('tier sadece A/B/C kabul eder', () => {
    const r = auditSynthesisSchema.safeParse({ ...validSynthesis, tier: 'D' })
    expect(r.success).toBe(false)
  })

  it('gap severity sadece low/med/high kabul eder', () => {
    const result = gapSchema.safeParse({ ...validGap, severity: 'critical' })
    expect(result.success).toBe(false)
  })

  it('strengths bos olamaz', () => {
    const r = auditSynthesisSchema.safeParse({ ...validSynthesis, strengths: [] })
    expect(r.success).toBe(false)
  })

  it('gaps bos olamaz', () => {
    const r = auditSynthesisSchema.safeParse({ ...validSynthesis, gaps: [] })
    expect(r.success).toBe(false)
  })

  it('strength.area cok uzun olamaz (max 80)', () => {
    const tooLong = 'x'.repeat(81)
    const r = strengthSchema.safeParse({ area: tooLong, note: 'ok' })
    expect(r.success).toBe(false)
  })

  it('narrative cok kisa olamaz', () => {
    const r = auditSynthesisSchema.safeParse({ ...validSynthesis, narrative: 'kisa' })
    expect(r.success).toBe(false)
  })

  it('tool input_schema sema yapisi structured-output uyumlu', () => {
    expect(submitAuditToolInputSchema.type).toBe('object')
    expect(submitAuditToolInputSchema.additionalProperties).toBe(false)
    expect(submitAuditToolInputSchema.required).toContain('narrative')
    expect(submitAuditToolInputSchema.required).toContain('tier')
    expect(submitAuditToolInputSchema.required).toContain('phone_script')
  })
})
