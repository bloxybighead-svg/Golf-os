"use client"

// Leaflet map over satellite imagery. All course math lives in lib/course;
// this component only draws and reports drags/clicks back up. Imported with
// next/dynamic (ssr: false) because Leaflet touches `window` on import.

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { LatLng } from "@/lib/course/geo"
import type { Lie, UserZone } from "@/lib/course/lies"
import type { CourseGeometry, FeatureKind } from "@/lib/course/overpass"
import type { Landing } from "@/lib/course/plan"
import { LIE_COLORS, type Placing } from "./courseColors"

// Leaflet's canvas renderer can fire a queued redraw after the map has been torn
// down (React dev double-mount, navigating away mid-draw), which throws on a
// context that no longer exists. Make that redraw a no-op instead.
type CanvasProto = { _redraw: () => void; _ctx?: unknown; __safe?: boolean }
const canvasProto = L.Canvas.prototype as unknown as CanvasProto
if (!canvasProto.__safe) {
  const original = canvasProto._redraw
  canvasProto._redraw = function (this: CanvasProto) {
    if (!this._ctx) return
    original.call(this)
  }
  canvasProto.__safe = true
}

const FEATURE_STYLE: Record<FeatureKind, L.PathOptions> = {
  green: { color: "#22c55e", weight: 1.5, fillColor: "#22c55e", fillOpacity: 0.3 },
  fairway: { color: "#a3e635", weight: 1, fillColor: "#a3e635", fillOpacity: 0.12 },
  bunker: { color: "#fde68a", weight: 1, fillColor: "#fde68a", fillOpacity: 0.45 },
  water: { color: "#38bdf8", weight: 1, fillColor: "#38bdf8", fillOpacity: 0.35 },
  tee: { color: "#d4d4d4", weight: 1, fillColor: "#d4d4d4", fillOpacity: 0.25 },
  trees: { color: "#c084fc", weight: 1, fillColor: "#c084fc", fillOpacity: 0.12, dashArray: "3 4" },
  range: { color: "#ef4444", weight: 1.5, fillColor: "#ef4444", fillOpacity: 0.18, dashArray: "6 4" },
}

interface Props {
  center: LatLng
  geometry: CourseGeometry | null
  selectedHoleId: string | null
  ball: LatLng | null
  aim: LatLng | null
  pin: LatLng | null
  landings: Landing[]
  labels: { pos: LatLng; text: string }[]
  cells: { sw: LatLng; ne: LatLng; color: string; opacity: number }[]
  rings: LatLng[][]
  zones: UserZone[]
  /** Hand-marking mode: while set, taps add vertices instead of moving ball/aim/pin. */
  drawKind: Lie | null
  pendingPoints: LatLng[]
  placing: Placing
  fitBounds: [[number, number], [number, number]] | null
  fitKey: string
  /** Zoom to open the map at (e.g. remembered from last time). Only used for the initial view -- picking a hole still fits its own bounds, which is a better default than a stale remembered number. */
  initialZoom?: number
  onZoomChange?: (zoom: number) => void
  /** Degrees clockwise from north the hole plays (tee -> green), for the compass overlay. Null hides it. */
  holeBearingDeg: number | null
  onBall: (p: LatLng) => void
  onAim: (p: LatLng) => void
  onPin: (p: LatLng) => void
  onPickHole: (id: string) => void
  onDrawPoint: (p: LatLng) => void
  /** Called instead of onDrawPoint when the tap lands on/near the first pending vertex, closing the shape. */
  onDrawClose: () => void
}

const ll = (p: LatLng): L.LatLngTuple => [p.lat, p.lng]

function markerIcon(color: string, label: string, ring = false): L.DivIcon {
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches
  const size = coarse ? 32 : 22 // fingers need a bigger handle than a mouse
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${ring ? "transparent" : color};border:3px solid ${color};box-shadow:0 0 0 2px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font:700 10px system-ui;color:${ring ? color : "#111"}">${label}</div>`,
  })
}

export default function CourseMap(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layers = useRef<{
    features: L.LayerGroup
    holes: L.LayerGroup
    landings: L.LayerGroup
    labels: L.LayerGroup
    cells: L.LayerGroup
    rings: L.LayerGroup
    zones: L.LayerGroup
    drawing: L.LayerGroup
    ball?: L.Marker
    aim?: L.Marker
    pin?: L.Marker
    path?: L.Polyline
    pinPath?: L.Polyline
  } | null>(null)
  const cb = useRef(props)
  cb.current = props

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    // Touch devices get pinch-to-zoom (Leaflet's default) instead of scroll-to-zoom, so a
    // finger scrolling the page over the map doesn't accidentally zoom it; a mouse gets plain
    // scroll-to-zoom, no modifier key needed.
    const isTouch = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
    const map = L.map(containerRef.current, {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 16,
      maxZoom: 19,
      scrollWheelZoom: !isTouch,
      touchZoom: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
    }).setView(
      ll(props.center),
      props.initialZoom ?? 16
    )
    L.control.zoom({ position: "bottomright" }).addTo(map)
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 19,
      maxZoom: 19,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics | Course data &copy; OpenStreetMap contributors",
    }).addTo(map)
    map.on("zoomend", () => cb.current.onZoomChange?.(map.getZoom()))
    map.on("click", (e: L.LeafletMouseEvent) => {
      const p = { lat: e.latlng.lat, lng: e.latlng.lng }
      const { drawKind, pendingPoints, onDrawPoint, onDrawClose, placing, onBall, onAim, onPin } = cb.current
      if (drawKind) {
        // Tapping on (or near, for a finger) the first vertex closes the shape --
        // easier on a phone than hunting for the Finish button.
        if (pendingPoints.length >= 3) {
          const coarse = window.matchMedia?.("(pointer: coarse)").matches
          const thresholdPx = coarse ? 26 : 14
          const first = map.latLngToContainerPoint(L.latLng(pendingPoints[0].lat, pendingPoints[0].lng))
          const tapped = map.latLngToContainerPoint(e.latlng)
          if (Math.hypot(first.x - tapped.x, first.y - tapped.y) <= thresholdPx) {
            onDrawClose()
            return
          }
        }
        onDrawPoint(p)
        return
      }
      if (placing === "ball") onBall(p)
      else if (placing === "aim") onAim(p)
      else onPin(p)
    })
    layers.current = {
      features: L.layerGroup().addTo(map),
      holes: L.layerGroup().addTo(map),
      cells: L.layerGroup().addTo(map),
      zones: L.layerGroup().addTo(map),
      landings: L.layerGroup().addTo(map),
      rings: L.layerGroup().addTo(map),
      drawing: L.layerGroup().addTo(map),
      labels: L.layerGroup().addTo(map),
    }
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layers.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Course polygons.
  useEffect(() => {
    const g = layers.current?.features
    if (!g) return
    g.clearLayers()
    for (const f of props.geometry?.features ?? []) {
      L.polygon(f.ring.map(ll), { ...FEATURE_STYLE[f.kind], interactive: false }).addTo(g)
    }
  }, [props.geometry])

  // Hole centerlines (click to select).
  useEffect(() => {
    const g = layers.current?.holes
    if (!g) return
    g.clearLayers()
    for (const h of props.geometry?.holes ?? []) {
      const selected = h.id === props.selectedHoleId
      const line = L.polyline(h.line.map(ll), {
        color: selected ? "#facc15" : "#ffffff",
        weight: selected ? 3 : 2,
        opacity: selected ? 0.95 : 0.55,
        dashArray: selected ? undefined : "4 6",
      }).addTo(g)
      line.bindTooltip(`${h.ref ?? "?"}${h.par ? ` · par ${h.par}` : ""}`, { sticky: true })
      line.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e)
        cb.current.onPickHole(h.id)
      })
    }
  }, [props.geometry, props.selectedHoleId])

  // Ball / aim / pin markers and the ball->aim line.
  useEffect(() => {
    const map = mapRef.current
    const l = layers.current
    if (!map || !l) return
    const upsert = (
      key: "ball" | "aim" | "pin",
      pos: LatLng | null,
      icon: L.DivIcon,
      onMove: (p: LatLng) => void
    ) => {
      const existing = l[key]
      if (!pos) {
        existing?.remove()
        l[key] = undefined
        return
      }
      if (existing) {
        existing.setLatLng(ll(pos))
        return
      }
      const m = L.marker(ll(pos), { icon, draggable: true, zIndexOffset: key === "ball" ? 1000 : 900 }).addTo(map)
      m.on("dragend", () => {
        const p = m.getLatLng()
        onMove({ lat: p.lat, lng: p.lng })
      })
      l[key] = m
    }
    upsert("ball", props.ball, markerIcon("#ffffff", "B"), (p) => cb.current.onBall(p))
    upsert("aim", props.aim, markerIcon("#facc15", "A", true), (p) => cb.current.onAim(p))
    upsert("pin", props.pin, markerIcon("#ef4444", "P"), (p) => cb.current.onPin(p))

    l.path?.remove()
    l.path = undefined
    l.pinPath?.remove()
    l.pinPath = undefined
    // aim -> pin: what is left after a shot that lands on the aim point
    if (props.aim && props.pin) {
      l.pinPath = L.polyline([ll(props.aim), ll(props.pin)], {
        color: "#ffffff",
        weight: 2,
        opacity: 0.8,
        dashArray: "2 6",
        interactive: false,
      }).addTo(map)
    }
    if (props.ball && props.aim) {
      l.path = L.polyline([ll(props.ball), ll(props.aim)], {
        color: "#facc15",
        weight: 2,
        dashArray: "6 6",
        interactive: false,
      }).addTo(map)
    }
  }, [props.ball, props.aim, props.pin])

  // Trouble map cells (drawn under everything else on the canvas).
  useEffect(() => {
    const g = layers.current?.cells
    if (!g) return
    g.clearLayers()
    for (const c of props.cells) {
      L.rectangle([ll(c.sw), ll(c.ne)], {
        stroke: false,
        fillColor: c.color,
        fillOpacity: c.opacity,
        interactive: false,
      }).addTo(g)
    }
  }, [props.cells])

  // User-drawn zones (hand-marked trees/water/OB/etc). Dashed outline distinguishes
  // them from the solid OSM-sourced polygons.
  useEffect(() => {
    const g = layers.current?.zones
    if (!g) return
    g.clearLayers()
    for (const z of props.zones) {
      L.polygon(z.ring.map(ll), {
        color: LIE_COLORS[z.lie],
        weight: 2,
        opacity: 0.9,
        fillColor: LIE_COLORS[z.lie],
        fillOpacity: 0.28,
        dashArray: "6 4",
        interactive: false,
      }).addTo(g)
    }
  }, [props.zones])

  // Live preview while hand-marking a new zone: vertex dots, joining lines, and a
  // dashed closing edge back to the first point once there are enough to close.
  useEffect(() => {
    const g = layers.current?.drawing
    if (!g) return
    g.clearLayers()
    const pts = props.pendingPoints
    const color = props.drawKind ? LIE_COLORS[props.drawKind] : "#facc15"
    if (pts.length > 0) {
      L.polyline(pts.map(ll), { color, weight: 2, interactive: false }).addTo(g)
      if (pts.length >= 3) {
        L.polyline([ll(pts[pts.length - 1]), ll(pts[0])], { color, weight: 2, dashArray: "4 4", opacity: 0.7, interactive: false }).addTo(g)
      }
      pts.forEach((p, i) => {
        // The first vertex is drawn bigger: tapping it (or near it, on a touchscreen) closes the shape.
        L.circleMarker(ll(p), {
          radius: i === 0 && pts.length >= 3 ? 9 : 5,
          color: "#111",
          weight: i === 0 ? 2 : 1.5,
          fillColor: color,
          fillOpacity: 1,
          interactive: false,
        }).addTo(g)
      })
    }
  }, [props.pendingPoints, props.drawKind])

  // Dispersion rings.
  useEffect(() => {
    const g = layers.current?.rings
    if (!g) return
    g.clearLayers()
    props.rings.forEach((r, i) => {
      L.polyline(r.map(ll), {
        color: "#ffffff",
        weight: i === 0 ? 2 : 1.5,
        opacity: i === 0 ? 0.95 : 0.7,
        dashArray: i === 0 ? undefined : "5 5",
        interactive: false,
      }).addTo(g)
    })
  }, [props.rings])

  // Yardage labels on the ball->aim and aim->pin lines.
  useEffect(() => {
    const g = layers.current?.labels
    if (!g) return
    g.clearLayers()
    for (const lab of props.labels) {
      L.marker(ll(lab.pos), {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          iconSize: [0, 0],
          html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;padding:2px 7px;border-radius:9999px;background:rgba(10,10,10,.82);border:1px solid rgba(255,255,255,.35);font:600 11px system-ui;color:#fff">${lab.text}</div>`,
        }),
      }).addTo(g)
    }
  }, [props.labels])

  // Simulated landing dots.
  useEffect(() => {
    const g = layers.current?.landings
    if (!g) return
    g.clearLayers()
    for (const s of props.landings) {
      L.circleMarker(ll(s.point), {
        radius: 3,
        color: "#111",
        weight: 0.5,
        fillColor: LIE_COLORS[s.lie],
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(g)
    }
  }, [props.landings])

  // Fit the view when a course or hole is picked.
  useEffect(() => {
    if (props.fitBounds && mapRef.current) {
      mapRef.current.fitBounds(props.fitBounds, { padding: [30, 30], maxZoom: 18 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" style={{ cursor: props.drawKind ? "crosshair" : undefined }} />
      {props.holeBearingDeg != null && <CompassOverlay bearingDeg={props.holeBearingDeg} />}
    </div>
  )
}

// Static, decorative: shows which way the hole plays relative to true north (the map itself
// isn't rotated -- north is always up -- so this is the only "orientation" cue on screen).
// Lives outside Leaflet's own DOM/control system entirely: it's just an absolutely-positioned
// sibling, so there's no risk of it interfering with the map's own click/drag coordinate math.
function CompassOverlay({ bearingDeg }: { bearingDeg: number }) {
  return (
    <div
      className="pointer-events-none absolute right-2 top-2 z-[1050] flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/60 backdrop-blur-sm"
      title={`Hole plays ${Math.round(bearingDeg)}° from north`}
    >
      <span className="absolute top-0.5 text-[8px] font-bold text-[#9ca3af]">N</span>
      <div className="relative h-7 w-7" style={{ transform: `rotate(${bearingDeg}deg)` }}>
        <svg viewBox="0 0 24 24" className="h-full w-full">
          <path d="M12 1 L17 15 L12 11.5 L7 15 Z" fill="#facc15" />
          <path d="M12 23 L9 13 L12 15.5 L15 13 Z" fill="#6b7280" />
        </svg>
      </div>
    </div>
  )
}
