/**
 * Haftalık planlayıcı - Gün tipi belirleme
 *
 * Pazartesi-Cuma: FIELD (saha ziyareti + telefon araması)
 * Cumartesi/Pazar: OFF
 *
 * FIELD_AGENT: Pzt-Cum 5 gün saha ziyareti (günde 10)
 * TELESALES_AGENT: Pzt-Cum 5 gün telefon araması (günde 20)
 */

import type { DayType } from '@/types/schedule'
import { DAY_INDEX_TO_TYPE } from '@/lib/constants'

/**
 * Verilen tarih için gün tipini döndür
 */
export function getDayType(date: Date): DayType {
  const dayIndex = date.getDay() // 0=Pazar, 1=Pazartesi, ...
  return DAY_INDEX_TO_TYPE[dayIndex] ?? 'OFF'
}

/**
 * Verilen tarih saha günü mü?
 */
export function isFieldDay(date: Date): boolean {
  return getDayType(date) === 'FIELD'
}

/**
 * Verilen tarih telefon günü mü?
 */
export function isRemoteDay(date: Date): boolean {
  return getDayType(date) === 'REMOTE'
}

/**
 * Verilen tarih çalışma günü mü? (FIELD, REMOTE veya ADMIN)
 */
export function isWorkDay(date: Date): boolean {
  const type = getDayType(date)
  return type !== 'OFF'
}

/**
 * Belirli bir tarih aralığındaki çalışma günlerini döndür
 */
export function getWorkDays(start: Date, end: Date): { date: Date; type: DayType }[] {
  const days: { date: Date; type: DayType }[] = []
  const current = new Date(start)
  current.setHours(0, 0, 0, 0)

  const endDate = new Date(end)
  endDate.setHours(23, 59, 59, 999)

  while (current <= endDate) {
    const type = getDayType(current)
    if (type !== 'OFF') {
      days.push({ date: new Date(current), type })
    }
    current.setDate(current.getDate() + 1)
  }

  return days
}

/**
 * Bugünün tarih ve gün tipini döndür (Istanbul UTC+3)
 * OFF günlerde null döndürür
 */
export function getTodayPlan(): { date: string; type: DayType } | null {
  const istanbulOffset = 3 * 60 * 60 * 1000
  const istanbulNow = new Date(Date.now() + istanbulOffset)
  const dateStr = istanbulNow.toISOString().split('T')[0]
  const type = getDayType(new Date(dateStr + 'T00:00:00'))
  if (type === 'OFF') return null
  return { date: dateStr, type }
}

/**
 * Gelecek hafta için gün planını oluştur
 */
export function getNextWeekPlan(fromDate: Date = new Date()): { date: Date; type: DayType }[] {
  const start = new Date(fromDate)
  // Sonraki pazartesiyi bul
  const dayOfWeek = start.getDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  start.setDate(start.getDate() + daysUntilMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 4) // Pazartesi -> Cuma

  return getWorkDays(start, end)
}
