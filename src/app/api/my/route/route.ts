import { routeModuleDisabledResponse } from '@/lib/route-status'

export async function GET() {
  return routeModuleDisabledResponse()
}
