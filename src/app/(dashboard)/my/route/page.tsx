'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function MyRoutePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rota Akışı Pasif</h1>
        <p className="text-muted-foreground">
          Saha görevi olmadığı için rota ekranı devre dışı bırakıldı.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Telefon listesine yönlendirme</CardTitle>
          <CardDescription>
            Günlük iş akışı artık yalnızca manuel oluşturulan arama listeleri üzerinden ilerliyor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/my/calls">Arama listeme git</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
