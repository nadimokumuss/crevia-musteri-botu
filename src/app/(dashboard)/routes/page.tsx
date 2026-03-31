'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function RoutesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rota Modülü Pasif</h1>
        <p className="text-muted-foreground">
          Saha ajanı akışı kapalı. Sistem yalnızca manuel telefon arama listeleriyle çalışıyor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bu ekran kullanılmıyor</CardTitle>
          <CardDescription>
            Yeni akışta rotalar oluşturulmaz ve rota endpoint&apos;leri 410 yanıtı döner.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Button asChild>
            <Link href="/admin">Yönetim ekranına git</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/calls">Arama listelerini görüntüle</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
