const ISTANBUL_TIME_ZONE = 'Europe/Istanbul'

function getDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const mapped = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  ) as Record<'year' | 'month' | 'day', string>

  return mapped
}

export function formatDateInTimeZone(
  date: Date,
  timeZone: string = ISTANBUL_TIME_ZONE
): string {
  const { year, month, day } = getDateParts(date, timeZone)
  return `${year}-${month}-${day}`
}

export function getTodayDateInIstanbul(): string {
  return formatDateInTimeZone(new Date(), ISTANBUL_TIME_ZONE)
}

export function formatLongDateInIstanbul(date: Date, locale: string = 'tr-TR'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: ISTANBUL_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function parseIstanbulDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+03:00`)
}

