import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
} from '@/lib/errors'

describe('AppError hiyerarşisi', () => {
  it('AppError temel alanları doğru', () => {
    const err = new AppError('test', 'TEST_CODE', 500, { key: 'val' })

    expect(err.message).toBe('test')
    expect(err.code).toBe('TEST_CODE')
    expect(err.statusCode).toBe(500)
    expect(err.data).toEqual({ key: 'val' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })

  it('NotFoundError 404 döner', () => {
    const err = new NotFoundError('Lead', 'abc-123')

    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toContain('abc-123')
    expect(err).toBeInstanceOf(AppError)
  })

  it('NotFoundError id olmadan çalışır', () => {
    const err = new NotFoundError('Ajan')
    expect(err.message).toBe('Ajan bulunamadı')
  })

  it('ValidationError 400 döner', () => {
    const err = new ValidationError('Email geçersiz', { field: 'email' })
    expect(err.statusCode).toBe(400)
    expect(err.data).toEqual({ field: 'email' })
  })

  it('UnauthorizedError 401 döner', () => {
    expect(new UnauthorizedError().statusCode).toBe(401)
  })

  it('ForbiddenError 403 döner', () => {
    expect(new ForbiddenError().statusCode).toBe(403)
  })

  it('ConflictError 409 döner', () => {
    const err = new ConflictError('Zaten mevcut')
    expect(err.statusCode).toBe(409)
  })

  it('RateLimitError 429 döner', () => {
    expect(new RateLimitError().statusCode).toBe(429)
  })

  it('ExternalServiceError 502 döner', () => {
    const err = new ExternalServiceError('Google', 'timeout')
    expect(err.statusCode).toBe(502)
    expect(err.message).toContain('Google')
    expect(err.message).toContain('timeout')
  })
})
