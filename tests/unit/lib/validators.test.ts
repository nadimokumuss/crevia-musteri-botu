import { describe, it, expect } from 'vitest'
import { isoDateString, createAssignmentSchema, setUserRoleSchema } from '@/lib/validators'

describe('isoDateString', () => {
  it('gecerli tarihi kabul eder', () => {
    expect(isoDateString.safeParse('2026-05-04').success).toBe(true)
    expect(isoDateString.safeParse('2024-02-29').success).toBe(true) // Artik yil
  })

  it('regex uyumsuz formati reddeder', () => {
    expect(isoDateString.safeParse('2026/05/04').success).toBe(false)
    expect(isoDateString.safeParse('04-05-2026').success).toBe(false)
    expect(isoDateString.safeParse('2026-5-4').success).toBe(false)
  })

  it('gecersiz takvim tarihini reddeder', () => {
    expect(isoDateString.safeParse('2026-13-01').success).toBe(false)
    expect(isoDateString.safeParse('2026-02-30').success).toBe(false)
    expect(isoDateString.safeParse('2025-02-29').success).toBe(false)
    expect(isoDateString.safeParse('2026-04-31').success).toBe(false)
  })

  it('tarih disi stringleri reddeder', () => {
    expect(isoDateString.safeParse('').success).toBe(false)
    expect(isoDateString.safeParse('hello').success).toBe(false)
  })
})

describe('createAssignmentSchema', () => {
  it('gecerli payloadi kabul eder', () => {
    const result = createAssignmentSchema.safeParse({
      lead_id: '550e8400-e29b-41d4-a716-446655440000',
      agent_id: '550e8400-e29b-41d4-a716-446655440001',
      assignment_type: 'CALL',
      scheduled_date: '2026-05-04',
    })
    expect(result.success).toBe(true)
  })

  it('gecersiz tarih ile reddeder', () => {
    const result = createAssignmentSchema.safeParse({
      lead_id: '550e8400-e29b-41d4-a716-446655440000',
      agent_id: '550e8400-e29b-41d4-a716-446655440001',
      assignment_type: 'CALL',
      scheduled_date: '2026-13-99',
    })
    expect(result.success).toBe(false)
  })
})

describe('setUserRoleSchema strict', () => {
  it('beklenmedik alani reddeder', () => {
    const result = setUserRoleSchema.safeParse({
      action: 'set-role',
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'ADMIN',
      hacker_field: 'evil',
    })
    expect(result.success).toBe(false)
  })

  it('gecerli payloadi kabul eder', () => {
    const result = setUserRoleSchema.safeParse({
      action: 'set-role',
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'ADMIN',
    })
    expect(result.success).toBe(true)
  })
})
