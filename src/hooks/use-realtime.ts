'use client'

import { useEffect, useEffectEvent, useRef } from 'react'
import { createClient } from '@/infra/supabase/client'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface UseRealtimeOptions<T extends Record<string, unknown>> {
  table: string
  event?: PostgresEvent
  schema?: string
  filter?: string
  onInsert?: (payload: T) => void
  onUpdate?: (payload: { old: T; new: T }) => void
  onDelete?: (payload: T) => void
  onChange?: (payload: RealtimePostgresChangesPayload<T>) => void
}

/**
 * Supabase Realtime'a abone olarak tablo değişikliklerini dinler.
 *
 * Kullanım:
 * ```ts
 * useRealtime<Lead>({
 *   table: 'leads',
 *   event: 'UPDATE',
 *   onUpdate: ({ new: updated }) => updateLeadInState(updated),
 * })
 * ```
 */
export function useRealtime<T extends Record<string, unknown>>(
  options: UseRealtimeOptions<T>
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const {
    table,
    event = '*',
    schema = 'public',
    filter,
    onInsert,
    onUpdate,
    onDelete,
    onChange,
  } = options

  const handleRealtimeChange = useEffectEvent(
    (payload: RealtimePostgresChangesPayload<T>) => {
      onChange?.(payload)

      if (payload.eventType === 'INSERT' && onInsert) {
        onInsert(payload.new as T)
      } else if (payload.eventType === 'UPDATE' && onUpdate) {
        onUpdate({
          old: payload.old as T,
          new: payload.new as T,
        })
      } else if (payload.eventType === 'DELETE' && onDelete) {
        onDelete(payload.old as T)
      }
    }
  )

  useEffect(() => {
    const supabase = createClient()

    const channelName = `realtime-${table}-${event}-${filter ?? 'all'}`

    const channelConfig: Record<string, string> = {
      event,
      schema,
      table,
    }
    if (filter) {
      channelConfig.filter = filter
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        channelConfig,
        handleRealtimeChange
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [event, filter, schema, table])
}
