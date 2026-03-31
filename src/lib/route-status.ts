import { NextResponse } from 'next/server'

const ROUTE_MODULE_DISABLED_MESSAGE =
  'Saha rota modulu su anda pasif. Sistem yalnizca manuel telesales arama listeleriyle calisiyor.'

const MANUAL_WORKFLOW_REQUIRED_MESSAGE =
  'Otomatik dagitim ve haftalik plan akisi pasif. Taramayi /api/scraper, arama listelerini /api/calls uzerinden manuel yonetin.'

export function routeModuleDisabledResponse() {
  return NextResponse.json(
    { error: ROUTE_MODULE_DISABLED_MESSAGE, code: 'ROUTE_MODULE_DISABLED' },
    { status: 410 }
  )
}

export function manualWorkflowRequiredResponse() {
  return NextResponse.json(
    {
      error: MANUAL_WORKFLOW_REQUIRED_MESSAGE,
      code: 'MANUAL_WORKFLOW_REQUIRED',
    },
    { status: 410 }
  )
}
