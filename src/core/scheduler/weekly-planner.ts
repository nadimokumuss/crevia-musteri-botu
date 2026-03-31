/**
 * Haftalık planlayıcı - Gün tipi belirleme
 *
 * Pazartesi-Cuma: REMOTE (telefon aramasi)
 * Cumartesi/Pazar: OFF
 */

import type { DayType } from '@/types/schedule'
import { DAY_INDEX_TO_TYPE } from '@/lib/constants'
import { getTodayDateInIstanbul, parseIstanbulDate } from '@/lib/date-utils'

/**
 * Verilen tarih için gün tipini döndür
 */
export function getDayType(date: Date): DayType {
  const dayIndex = date.getDay() // 0=Pazar, 1=Pazartesi, ...
  return DAY_INDEX_TO_TYPE[dayIndex] ?? 'OFF'
}

/**
 * Legacy uyumluluk yardimcisi.
 * Guncel takvimde saha gunu yoktur.
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
 * Verilen tarih calisma gunu mu?
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
 * Bugunun tarih ve gun tipini dondurur (Istanbul)
 * OFF gunlerde null dondurur.
 */
export function getTodayPlan(): { date: string; type: DayType } | null {
  const dateStr = getTodayDateInIstanbul()
  const type = getDayType(parseIstanbulDate(dateStr))
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
