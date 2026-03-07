'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { filterNavByRole } from '@/lib/nav-config'
import { useCurrentUser } from '@/hooks/use-current-user'

export function MobileNav() {
  const pathname = usePathname()
  const { user, isLoading } = useCurrentUser()

  if (isLoading || !user) return null

  const mobileItems = filterNavByRole(user.role).slice(0, 5)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <nav className="flex justify-around p-1">
        {mobileItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[11px]',
              pathname.startsWith(item.href)
                ? 'font-medium text-foreground'
                : 'text-muted-foreground'
            )}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
