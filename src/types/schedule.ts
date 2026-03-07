/**
 * Haftalık takvim tip tanımları
 */

export type DayType = 'FIELD' | 'REMOTE' | 'ADMIN' | 'OFF'

export interface WeeklySchedule {
  monday: DayType
  tuesday: DayType
  wednesday: DayType
  thursday: DayType
  friday: DayType
  saturday: DayType
  sunday: DayType
}
