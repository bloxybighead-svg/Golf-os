"use client"

// A small map of one hole's recorded shots: a line from where each shot started to where it finished.

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { LatLng } from "@/lib/course/geo"
import { readColor } from "@/lib/theme/tokens"

export interface ShotLine {
  from: LatLng
  to: LatLng
}

const ll = (p: LatLng): L.LatLngTuple => [p.lat, p.lng]

export default function ShotsMap({ lines, pin }: { lines: readonly ShotLine[]; pin: LatLng | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || lines.length === 0) return
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, maxZoom: 19, zoomSnap: 0.5 })
    // Live satellite tiles only, never stored (Esri's terms; same as the Play map).
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: 19, maxZoom: 19 }).addTo(map)
    const aim = readColor("map-aim")
    const ball = readColor("map-marker")
    const points: L.LatLngTuple[] = []
    for (const s of lines) {
      L.polyline([ll(s.from), ll(s.to)], { color: aim, weight: 3, opacity: 0.9 }).addTo(map)
      L.circleMarker(ll(s.from), { radius: 4, color: ball, fillColor: ball, fillOpacity: 1, weight: 1 }).addTo(map)
      points.push(ll(s.from), ll(s.to))
    }
    if (pin) {
      L.circleMarker(ll(pin), { radius: 5, color: ball, fillColor: readColor("lie-oob"), fillOpacity: 1, weight: 2 }).addTo(map)
      points.push(ll(pin))
    }
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 19 })
    return () => {
      map.remove()
    }
  }, [lines, pin])

  return (
    <div className="relative h-56 overflow-hidden rounded-lg border border-fg/[0.08] bg-surface-3">
      <div ref={ref} className="h-full w-full" />
      <p className="pointer-events-none absolute bottom-0 right-0 z-[1000] max-w-full truncate bg-black/50 px-1.5 py-px text-[9px] text-white/80">
        © Esri, Maxar, Earthstar Geographics
      </p>
    </div>
  )
}
