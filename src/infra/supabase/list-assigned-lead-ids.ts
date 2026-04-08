import { z } from 'zod'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

const ASSIGNMENT_PAGE_SIZE = 1000

const assignmentLeadRowSchema = z.object({
  lead_id: z.string().uuid(),
})

interface AssignedLeadIdClient {
  from(table: 'assignments'): {
    select(columns: 'lead_id'): {
      order(column: 'lead_id', options: { ascending: boolean }): {
        range(
          from: number,
          to: number
        ): PromiseLike<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
}

export async function listAssignedLeadIds(
  supabase: AssignedLeadIdClient
): Promise<Set<string>> {
  const assignedLeadIds = new Set<string>()
  let page = 0
  let hasMore = true

  while (hasMore) {
    const from = page * ASSIGNMENT_PAGE_SIZE
    const to = from + ASSIGNMENT_PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('assignments')
      .select('lead_id')
      .order('lead_id', { ascending: true })
      .range(from, to)

    if (error) {
      logger.error('Atanmis lead ID listesi getirilemedi', {
        error: error.message,
        page,
      })
      throw new AppError('Atama verileri alinamadi', 'ASSIGNMENTS_FETCH_FAILED', 500)
    }

    const parsedRows = z.array(assignmentLeadRowSchema).safeParse(data ?? [])

    if (!parsedRows.success) {
      logger.error('Atanmis lead ID listesi dogrulanamadi', {
        page,
        issues: parsedRows.error.issues,
      })
      throw new AppError('Atama verileri alinamadi', 'ASSIGNMENTS_DATA_INVALID', 500)
    }

    for (const row of parsedRows.data) {
      assignedLeadIds.add(row.lead_id)
    }

    hasMore = parsedRows.data.length === ASSIGNMENT_PAGE_SIZE
    page += 1
  }

  return assignedLeadIds
}
