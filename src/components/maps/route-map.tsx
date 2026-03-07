'use client'

import { useEffect, useState } from 'react'
import type { GeoPoint } from '@/types/geo'

interface RouteMapProps {
  stops: (GeoPoint & { label?: string })[]
  center?: GeoPoint
  zoom?: number
}

/**
 * React-Leaflet harita bileşeni
 *
 * Dynamic import ile yüklenir (SSR uyumluluğu için)
 */
export function RouteMap({ stops, center, zoom = 12 }: RouteMapProps) {
  const [MapComponent, setMapComponent] = useState<React.ComponentType<RouteMapProps> | null>(null)

  useEffect(() => {
    // Leaflet sadece client-side'da yüklenmeli
    import('./route-map-client').then((mod) => {
      setMapComponent(() => mod.RouteMapClient)
    })
  }, [])

  if (!MapComponent) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted">
        <p className="text-muted-foreground">Harita yükleniyor...</p>
      </div>
    )
  }

  return <MapComponent stops={stops} center={center} zoom={zoom} />
}
