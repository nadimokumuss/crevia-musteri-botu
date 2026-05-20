import { NextResponse } from 'next/server'

const MANUAL_WORKFLOW_REQUIRED_MESSAGE =
  'Otomatik dagitim ve haftalik plan akisi pasif. Taramayi /api/scraper, arama listelerini /api/calls uzerinden manuel yonetin.'

export function manualWorkflowRequiredResponse() {
  return NextResponse.json(
    {
      error: MANUAL_WORKFLOW_REQUIRED_MESSAGE,
      code: 'MANUAL_WORKFLOW_REQUIRED',
    },
    { status: 410 }
  )
}
