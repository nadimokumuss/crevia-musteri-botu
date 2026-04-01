import { describe, expect, it } from 'vitest'
import {
  getAllowedRolesForPath,
  getDefaultPathForRole,
  PAGE_PERMISSIONS,
  PUBLIC_PATH_PREFIXES,
} from '@/core/auth/access-control'

describe('access-control', () => {
  it('aktif dashboard ve api yetkilerini tek kaynaktan verir', () => {
    expect(PAGE_PERMISSIONS['/settings']).toEqual(['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT'])
    expect(getAllowedRolesForPath('/api/my/calls')).toEqual(['FIELD_AGENT', 'TELESALES_AGENT'])
    expect(getAllowedRolesForPath('/calls')).toEqual(['ADMIN', 'TELESALES_AGENT'])
  })

  it('eşleşmeyen yollar için null döner', () => {
    expect(getAllowedRolesForPath('/login')).toBeNull()
    expect(getAllowedRolesForPath('/favicon.ico')).toBeNull()
  })

  it('public path prefix ve varsayılan yönlendirme kararlarını sabit tutar', () => {
    expect(PUBLIC_PATH_PREFIXES).toContain('/api/auth')
    expect(getDefaultPathForRole('ADMIN')).toBe('/analytics')
    expect(getDefaultPathForRole('FIELD_AGENT')).toBe('/my/calls')
    expect(getDefaultPathForRole('TELESALES_AGENT')).toBe('/my/calls')
  })
})
