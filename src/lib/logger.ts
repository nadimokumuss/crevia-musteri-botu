/**
 * Yapılandırılmış logger
 *
 * console.log YASAK - Bu modülü kullanın.
 * PII alanları (telefon, email, token vb.) otomatik maskelenir.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  data?: Record<string, unknown>
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /phone/i,
  /email/i,
  /^pwd$/i,
]

const REDACTED = '***'
const MAX_DEPTH = 6

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value
  if (depth >= MAX_DEPTH) return '[truncated]'

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (isSensitiveKey(k)) {
        result[k] = v === null || v === undefined || v === '' ? v : REDACTED
      } else {
        result[k] = sanitizeValue(v, depth + 1)
      }
    }
    return result
  }

  return value
}

function sanitizeContext(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return data
  return sanitizeValue(data, 0) as Record<string, unknown>
}

function formatEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`
  if (entry.data) {
    return `${base} ${JSON.stringify(entry.data)}`
  }
  return base
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    data: sanitizeContext(data),
  }

  const formatted = formatEntry(entry)

  switch (level) {
    case 'debug':
      console.debug(formatted)
      break
    case 'info':
      console.info(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    case 'error':
      console.error(formatted)
      break
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
}

/**
 * İstek bağlamı için child logger üret — agent_id, request_id gibi sabit alanları her log'a ekler
 */
export function withContext(context: Record<string, unknown>) {
  const merge = (data?: Record<string, unknown>): Record<string, unknown> => ({
    ...context,
    ...(data ?? {}),
  })
  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, merge(data)),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, merge(data)),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, merge(data)),
    error: (message: string, data?: Record<string, unknown>) => log('error', message, merge(data)),
  }
}
