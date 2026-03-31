import { manualWorkflowRequiredResponse } from '@/lib/route-status'

export async function POST() {
  return manualWorkflowRequiredResponse()
}
