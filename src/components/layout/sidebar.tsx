'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { filterNavByRole, ROLE_CONFIG } from '@/lib/nav-config'
import { WINX_FAIRIES } from '@/lib/constants'
import { useCurrentUser, clearUserCache } from '@/hooks/use-current-user'
import { createClient } from '@/infra/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading } = useCurrentUser()

  const navItems = user ? filterNavByRole(user.role) : []
  const roleConfig = user ? ROLE_CONFIG[user.role] : null

  async function handleSignOut() {
    clearUserCache()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="flex h-full flex-col gap-1 p-4">
      <Link href="/leads" className="mb-6 block">
        <h2 className="text-lg font-bold">Crevia Sales OS</h2>
        <p className="text-xs text-muted-foreground">Satis Yonetim Platformu</p>
      </Link>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      ) : (
        navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))
      )}

      {/* Kullanici bilgisi - dibe yapismis */}
      <div className="mt-auto border-t pt-4">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : user ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="truncate text-sm font-medium">
                {user.fullName || user.email}
                {user.winxFairy ? ` (${WINX_FAIRIES.find((f) => f.id === user.winxFairy)?.name})` : ''}
              </p>
              {roleConfig && (
                <Badge variant="secondary" className={roleConfig.className}>
                  {roleConfig.label}
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleSignOut}
            >
              Cikis Yap
            </Button>
          </div>
        ) : null}
      </div>
    </nav>
  )
}
