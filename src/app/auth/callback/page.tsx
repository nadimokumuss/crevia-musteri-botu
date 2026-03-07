'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/infra/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SupabaseClient } from '@supabase/supabase-js'

function CallbackHandler() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'set-password'>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Aynı client instance'ını kullan — session bu instance'ta yaşıyor
  const clientRef = useRef<SupabaseClient | null>(null)

  useEffect(() => {
    const supabase = createClient()
    clientRef.current = supabase

    async function handleCallback() {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const hash = window.location.hash
      const isInvite = hash.includes('type=invite') || url.searchParams.get('type') === 'invite'

      // PKCE flow: code parametresi varsa session'a çevir
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setError(exchangeError.message)
          return
        }
      }

      // Session kontrolü
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        if (isInvite || hash.includes('type=recovery')) {
          setPhase('set-password')
        } else {
          router.push('/leads')
          router.refresh()
        }
        return
      }

      // Hash fragment ile gelen token (eski flow)
      if (hash.includes('access_token')) {
        // Supabase client otomatik handle eder, biraz bekle
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_IN') {
            if (isInvite) {
              setPhase('set-password')
            } else {
              router.push('/leads')
              router.refresh()
            }
            subscription.unsubscribe()
          }
        })
        return
      }

      // Hiçbir token yok — login'e yönlendir
      setError('Geçersiz veya süresi dolmuş bağlantı. Lütfen yöneticinizden yeni davet isteyin.')
    }

    handleCallback()
  }, [router])

  async function handleSetPassword() {
    setError(null)

    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı')
      return
    }

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor')
      return
    }

    setIsLoading(true)
    try {
      const supabase = clientRef.current!
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError(updateError.message)
        return
      }

      // Başarılı — ana sayfaya yönlendir
      window.location.href = '/leads'
    } finally {
      setIsLoading(false)
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        {error ? (
          <div className="space-y-4 text-center">
            <p className="text-red-600">{error}</p>
            <Button variant="outline" onClick={() => router.push('/login')}>
              Giriş Sayfasına Dön
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">Yönlendiriliyor...</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Şifre Belirle</CardTitle>
          <CardDescription>
            Hesabınız oluşturuldu. Lütfen giriş için bir şifre belirleyin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Yeni Şifre</label>
            <Input
              type="password"
              placeholder="En az 6 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Şifre Tekrar</label>
            <Input
              type="password"
              placeholder="Şifrenizi tekrar girin"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>
          )}

          <Button
            onClick={handleSetPassword}
            disabled={isLoading || !password || !confirmPassword}
            className="w-full"
          >
            {isLoading ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Yükleniyor...</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  )
}
