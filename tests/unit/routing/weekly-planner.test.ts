import { describe, it, expect } from 'vitest'
import { getDayType, isFieldDay, isRemoteDay, isWorkDay, getWorkDays } from '@/core/scheduler/weekly-planner'

describe('getDayType', () => {
  it('Pazartesi = REMOTE', () => {
    // 2026-02-16 Pazartesi
    expect(getDayType(new Date(2026, 1, 16))).toBe('REMOTE')
  })

  it('Salı = REMOTE', () => {
    expect(getDayType(new Date(2026, 1, 17))).toBe('REMOTE')
  })

  it('Çarşamba = REMOTE', () => {
    expect(getDayType(new Date(2026, 1, 18))).toBe('REMOTE')
  })

  it('Perşembe = REMOTE', () => {
    expect(getDayType(new Date(2026, 1, 19))).toBe('REMOTE')
  })

  it('Cuma = REMOTE', () => {
    expect(getDayType(new Date(2026, 1, 20))).toBe('REMOTE')
  })

  it('Cumartesi = OFF', () => {
    expect(getDayType(new Date(2026, 1, 21))).toBe('OFF')
  })

  it('Pazar = OFF', () => {
    expect(getDayType(new Date(2026, 1, 22))).toBe('OFF')
  })
})

describe('isFieldDay', () => {
  it('Salı saha günü değildir', () => {
    expect(isFieldDay(new Date(2026, 1, 17))).toBe(false)
  })

  it('Pazartesi saha günü değildir', () => {
    expect(isFieldDay(new Date(2026, 1, 16))).toBe(false)
  })
})

describe('isRemoteDay', () => {
  it('Pazartesi telefon günüdür', () => {
    expect(isRemoteDay(new Date(2026, 1, 16))).toBe(true)
  })

  it('Salı da telefon günüdür', () => {
    expect(isRemoteDay(new Date(2026, 1, 17))).toBe(true)
  })
})

describe('isWorkDay', () => {
  it('Pazartesi çalışma günüdür', () => {
    expect(isWorkDay(new Date(2026, 1, 16))).toBe(true)
  })

  it('Cumartesi çalışma günü değildir', () => {
    expect(isWorkDay(new Date(2026, 1, 21))).toBe(false)
  })

  it('Cuma çalışma günüdür', () => {
    expect(isWorkDay(new Date(2026, 1, 20))).toBe(true)
  })
})

describe('getWorkDays', () => {
  it('bir haftalık çalışma günlerini döner', () => {
    const start = new Date(2026, 1, 16) // Pazartesi
    const end = new Date(2026, 1, 22)   // Pazar

    const workDays = getWorkDays(start, end)

    expect(workDays).toHaveLength(5) // Pzt, Sal, Çar, Per, Cum
    expect(workDays[0].type).toBe('REMOTE')  // Pzt
    expect(workDays[1].type).toBe('REMOTE')  // Sal
    expect(workDays[2].type).toBe('REMOTE')  // Çar
    expect(workDays[3].type).toBe('REMOTE')  // Per
    expect(workDays[4].type).toBe('REMOTE')  // Cum
  })

  it('hafta sonu günlerini dahil etmez', () => {
    const start = new Date(2026, 1, 21) // Cumartesi
    const end = new Date(2026, 1, 22)   // Pazar

    const workDays = getWorkDays(start, end)
    expect(workDays).toHaveLength(0)
  })
})
