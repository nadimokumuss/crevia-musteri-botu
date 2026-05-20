'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createClient } from '@/infra/supabase/client'

export function PreferencesBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    async function checkPreferences() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: agent } = await supabase
          .from('agents')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!agent) return

        const res = await fetch(`/api/agents/preferences?agent_id=${agent.id}`)
        if (!res.ok) return

        const prefs = await res.json()
        if (!prefs.district_ids || prefs.district_ids.length === 0) {
          setShow(true)
        }
      } catch {
        // sessizce atla
      }
    }
    checkPreferences()
  }, [])

  if (!show) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-amber-800">
        Ilce ve sektor secmezseniz, yonetici sizin icin manuel arama listesi olustururken tum lead havuzunu kullanir.
      </p>
      <Link href="/settings">
        <Button variant="outline" size="sm" className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100">
          Ilce ve Sektor Sec
        </Button>
      </Link>
    </div>
  )
}
