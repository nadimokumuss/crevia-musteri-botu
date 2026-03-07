/**
 * Çalışma zamanı adaptör seçimi (Factory Pattern)
 *
 * Faz 2'de implement edilecek.
 */

import type { ILeadSource } from './lead-source.interface'
import { GooglePlacesAdapter } from './google-places.adapter'
import { ApifyAdapter } from './apify.adapter'
import { InstagramAdapter } from './instagram.adapter'

export type AdapterName = 'google-places' | 'apify' | 'instagram'

export function createLeadSource(name: AdapterName): ILeadSource {
  switch (name) {
    case 'google-places':
      return new GooglePlacesAdapter()
    case 'apify':
      return new ApifyAdapter()
    case 'instagram':
      return new InstagramAdapter()
    default:
      throw new Error(`Unknown adapter: ${name}`)
  }
}
