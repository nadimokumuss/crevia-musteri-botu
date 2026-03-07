'use client'

import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeoPoint } from '@/types/geo'


function createNumberedIcon(number: number) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: #2563eb;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 12px;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

interface RouteMapClientProps {
  stops: (GeoPoint & { label?: string })[]
  center?: GeoPoint
  zoom?: number
}

export function RouteMapClient({ stops, center, zoom = 12 }: RouteMapClientProps) {
  const mapCenter = center ?? (stops.length > 0 ? stops[0] : { lat: 41.0082, lng: 28.9784 })

  const polylinePositions = stops.map((s) => [s.lat, s.lng] as [number, number])

  return (
    <MapContainer
      center={[mapCenter.lat, mapCenter.lng]}
      zoom={zoom}
      className="h-[500px] w-full rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {stops.map((stop, index) => (
        <Marker
          key={stop.id ?? index}
          position={[stop.lat, stop.lng]}
          icon={createNumberedIcon(index + 1)}
        >
          <Popup>
            <div>
              <strong>#{index + 1}</strong>
              {stop.label && <p>{stop.label}</p>}
              <p className="text-xs text-gray-500">
                {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}

      {polylinePositions.length > 1 && (
        <Polyline
          positions={polylinePositions}
          color="#2563eb"
          weight={3}
          opacity={0.7}
          dashArray="10, 6"
        />
      )}
    </MapContainer>
  )
}
