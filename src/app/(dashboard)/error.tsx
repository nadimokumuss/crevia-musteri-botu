'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Bir hata oluştu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {error.message || 'Sayfa yüklenirken beklenmeyen bir hata oluştu.'}
          </p>
          <div className="flex gap-2">
            <Button onClick={reset} variant="outline">
              Tekrar Dene
            </Button>
            <Button onClick={() => (window.location.href = '/my/calls')} variant="ghost">
              Ana Sayfa
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
