/**
 * AppError sınıf hiyerarşisi
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly data?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} bulunamadı: ${id}` : `${resource} bulunamadı`,
      'NOT_FOUND',
      404
    )
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, data?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, data)
    this.name = 'ValidationError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Yetkisiz erişim') {
    super(message, 'UNAUTHORIZED', 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Erişim reddedildi') {
    super(message, 'FORBIDDEN', 403)
    this.name = 'ForbiddenError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409)
    this.name = 'ConflictError'
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'İstek sınırı aşıldı') {
    super(message, 'RATE_LIMIT', 429)
    this.name = 'RateLimitError'
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service} hatası: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502)
    this.name = 'ExternalServiceError'
  }
}

/**
 * Yakalanmış hatayı kullanıcıya gösterilecek güvenli mesaja çevir
 * — `AppError` ve `ZodError` doğal okunaklı mesaj verir
 * — diğerleri stack/PII içerebilir, generic mesaja düşürülür
 */
export function toClientErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    return err.message
  }
  if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    const first = (err as { issues: Array<{ message?: string }> }).issues[0]
    return first?.message ?? 'Geçersiz veri'
  }
  return 'Sunucu hatası'
}

/**
 * AppError → HTTP status code
 */
export function toClientErrorStatus(err: unknown): number {
  if (err instanceof AppError) return err.statusCode
  if (err && typeof err === 'object' && 'issues' in err) return 400
  return 500
}
