import { listAssignedLeadIds } from '@/infra/supabase/list-assigned-lead-ids'
import { AppError } from '@/lib/errors'
import { describe, expect, it, vi } from 'vitest'

interface AssignmentLeadRow {
  lead_id: string
}

function makeLeadId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function createSupabaseMock(pages: Array<AssignmentLeadRow[] | null>, errorAtPage?: number) {
  const range = vi.fn(async (from: number, to: number) => {
    const page = Math.floor(from / 1000)

    expect(to).toBe(from + 999)

    if (errorAtPage === page) {
      return {
        data: null,
        error: { message: `page-${page}-failed` },
      }
    }

    return {
      data: pages[page] ?? [],
      error: null,
    }
  })

  const order = vi.fn(() => ({ range }))
  const select = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ select }))

  return {
    supabase: { from },
    from,
    select,
    order,
    range,
  }
}

describe('listAssignedLeadIds', () => {
  it('1000 satirdan fazla assignment verisini sayfali toplar', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      lead_id: makeLeadId(index + 1),
    }))
    const secondPage = [
      { lead_id: makeLeadId(1001) },
      { lead_id: makeLeadId(1002) },
    ]
    const { supabase, from, select, order, range } = createSupabaseMock([
      firstPage,
      secondPage,
    ])

    const assignedLeadIds = await listAssignedLeadIds(supabase)

    expect(assignedLeadIds.size).toBe(1002)
    expect(assignedLeadIds.has(makeLeadId(1002))).toBe(true)
    expect(from).toHaveBeenCalledTimes(2)
    expect(from).toHaveBeenNthCalledWith(1, 'assignments')
    expect(select).toHaveBeenNthCalledWith(1, 'lead_id')
    expect(order).toHaveBeenNthCalledWith(1, 'lead_id', { ascending: true })
    expect(range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('veritabani hatasini 500 AppError olarak yukseltir', async () => {
    const { supabase } = createSupabaseMock([[]], 0)

    await expect(listAssignedLeadIds(supabase)).rejects.toMatchObject({
      message: 'Atama verileri alinamadi',
      code: 'ASSIGNMENTS_FETCH_FAILED',
      statusCode: 500,
    } satisfies Partial<AppError>)
  })
})
