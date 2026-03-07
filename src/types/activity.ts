export type ActivityType =
  | 'STATUS_CHANGE'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_UPDATED'
  | 'CALL_LOGGED'
  | 'VISIT_LOGGED'
  | 'SCORE_CALCULATED'
  | 'NOTE_ADDED'
  | 'LEAD_CREATED'

export interface LeadActivity {
  id: string
  lead_id: string
  activity_type: ActivityType
  agent_id: string | null
  description: string
  old_value: string | null
  new_value: string | null
  metadata: Record<string, unknown>
  created_at: string
  agents?: { full_name: string } | null
}
