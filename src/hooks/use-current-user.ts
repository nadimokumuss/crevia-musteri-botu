'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/infra/supabase/client'
import type { AgentRole } from '@/types/database'

export interface CurrentUser {
  id: string
  email: string
  fullName: string
  role: AgentRole
  winxFairy: string | null
}

interface UseCurrentUserReturn {
  user: CurrentUser | null
  isLoading: boolean
}

let cachedUser: CurrentUser | null = null
let cachePromise: Promise<CurrentUser | null> | null = null

export function clearUserCache() {
  cachedUser = null
  cachePromise = null
}

function fetchUser(): Promise<CurrentUser | null> {
  if (cachePromise) return cachePromise

  cachePromise = createClient()
    .auth.getUser()
    .then(({ data: { user } }) => {
      if (!user) return null
      cachedUser = {
        id: user.id,
        email: user.email ?? '',
        fullName: user.user_metadata?.full_name ?? '',
        role: (user.user_metadata?.role as AgentRole) ?? 'FIELD_AGENT',
        winxFairy: (user.user_metadata?.winx_fairy as string) ?? null,
      }
      return cachedUser
    })
    .catch(() => null)

  return cachePromise
}

export function useCurrentUser(): UseCurrentUserReturn {
  const [user, setUser] = useState<CurrentUser | null>(cachedUser)
  const [isLoading, setIsLoading] = useState(!cachedUser)

  useEffect(() => {
    if (!cachedUser) {
      fetchUser().then((result) => {
        setUser(result)
        setIsLoading(false)
      })
    }

    // Auth state degisikligini dinle
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        clearUserCache()
        if (event === 'SIGNED_OUT') {
          setUser(null)
        } else {
          fetchUser().then((result) => setUser(result))
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, isLoading }
}
