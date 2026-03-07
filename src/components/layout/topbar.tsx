'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getDayType } from '@/core/scheduler/weekly-planner'
import { WINX_FAIRIES } from '@/lib/constants'
import { useCurrentUser } from '@/hooks/use-current-user'

const DAY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  FIELD: { label: 'Saha Günü', color: 'bg-green-100 text-green-800' },
  OFF: { label: 'Tatil', color: 'bg-gray-100 text-gray-800' },
}

export function Topbar() {
  const router = useRouter()
  const today = new Date()
  const dayType = getDayType(today)
  const dayConfig = DAY_TYPE_LABELS[dayType]
  const { user } = useCurrentUser()

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Geri"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium md:hidden">Crevia Sales OS</span>
        <span className="hidden text-sm text-muted-foreground md:block">
          {today.toLocaleDateString('tr-TR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden text-sm font-medium md:block">
            {user.fullName || user.email}
            {user.winxFairy ? ` (${WINX_FAIRIES.find((f) => f.id === user.winxFairy)?.name})` : ''}
          </span>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${dayConfig.color}`}
        >
          {dayConfig.label}
        </span>
      </div>
    </header>
  )
}
