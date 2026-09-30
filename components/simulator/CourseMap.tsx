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
import { LIE_TOKEN, type Placing } from "./courseColors"
import { cssColor, readColor } from "@/lib/theme/tokens"

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

// Map layers are drawn on a canvas, which can't resolve CSS variables, so
// colors are read from the tokens when a layer is drawn (readColor).
const FEATURE_STYLE: Record<FeatureKind, { token: string; weight: number; fillOpacity: number; dashArray?: string }> = {
  green: { token: "map-green", weight: 1.5, fillOpacity: 0.3 },
  fairway: { token: "map-fairway", weight: 1, fillOpacity: 0.12 },
  bunker: { token: "map-bunker", weight: 1, fillOpacity: 0.45 },
  water: { token: "lie-water", weight: 1, fillOpacity: 0.35 },
  tee: { token: "map-tee", weight: 1, fillOpacity: 0.25 },
  trees: { token: "lie-trees", weight: 1, fillOpacity: 0.12, dashArray: "3 4" },
  range: { token: "lie-oob", weight: 1.5, fillOpacity: 0.18, dashArray: "6 4" },
}

function featureStyle(kind: FeatureKind): L.PathOptions {
  const { token, ...rest } = FEATURE_STYLE[kind]
  const color = readColor(token)
  return { ...rest, color, fillColor: color }
}

interface Props {
  center: LatLng
  geometry: CourseGeometry | null
  selectedHoleId: string | null
  ball: LatLng | null
  aim: LatLng | null
  pin: LatLng | null
  landings: Landing[]
  /** Also draw where each shot first landed (hollow), not only where it stopped. */
  showCarry?: boolean
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

type MarkerKind = "ball" | "aim" | "pin"

// Real glyphs rather than lettered dots: a white ball with a shadow ring, a
// crosshair for the aim, and a flag whose base sits exactly on the pin. Each
// sits inside a larger transparent box so there's enough to grab with a finger.
function markerIcon(kind: MarkerKind): L.DivIcon {
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches
  const hit = coarse ? 40 : 26
  const edge = cssColor("map-scrim", 0.6)

  if (kind === "ball") {
    const d = coarse ? 16 : 12
    return L.divIcon({
      className: "",
      iconSize: [hit, hit],
      iconAnchor: [hit / 2, hit / 2],
      html: `<div style="width:${hit}px;height:${hit}px;display:flex;align-items:center;justify-content:center"><div style="width:${d}px;height:${d}px;border-radius:50%;background:${cssColor("map-marker")};box-shadow:0 0 0 2px ${edge},0 2px 5px ${cssColor("map-scrim", 0.5)}"></div></div>`,
    })
  }

  if (kind === "aim") {
    const s = coarse ? 34 : 26
    const lines = "M12 1V7M12 17V23M1 12H7M17 12H23"
    return L.divIcon({
      className: "",
      iconSize: [hit, hit],
      iconAnchor: [hit / 2, hit / 2],
      html: `<div style="width:${hit}px;height:${hit}px;display:flex;align-items:center;justify-content:center"><svg width="${s}" height="${s}" viewBox="0 0 24 24" style="overflow:visible"><g style="fill:none;stroke:${edge};stroke-width:4;stroke-linecap:round"><circle cx="12" cy="12" r="6.5"/><path d="${lines}"/></g><g style="fill:none;stroke:${cssColor("map-aim")};stroke-width:2;stroke-linecap:round"><circle cx="12" cy="12" r="6.5"/><path d="${lines}"/></g><circle cx="12" cy="12" r="1.6" style="fill:${cssColor("map-aim")}"/></svg></div>`,
    })
  }

  // Pin: a flagstick whose foot (x=7, y=31 of 24x32) is the anchor, so the pin
  // position is the hole, not the middle of the flag.
  const w = coarse ? 30 : 22
  const h = Math.round((w * 32) / 24)
  return L.divIcon({
    className: "",
    iconSize: [w, h],
    iconAnchor: [Math.round((w * 7) / 24), Math.round((h * 31) / 32)],
    html: `<svg width="${w}" height="${h}" viewBox="0 0 24 32" style="overflow:visible;display:block"><ellipse cx="7" cy="31" rx="4" ry="1.5" style="fill:${cssColor("map-scrim", 0.7)}"/><path d="M7 31V2" style="stroke:${edge};stroke-width:4;stroke-linecap:round"/><path d="M8 2.5L21 7.5L8 12.5Z" style="fill:${cssColor("lie-oob")};stroke:${edge};stroke-width:1.5;stroke-linejoin:round"/><path d="M7 31V2" style="stroke:${cssColor("map-marker")};stroke-width:2;stroke-linecap:round"/></svg>`,
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
    // Wheel-zoom is off so scrolling the page over the map does not hijack it; Ctrl/Cmd + wheel zooms
    // (touch devices get pinch-to-zoom, Leaflet's default, regardless).
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      minZoom: 16,
      maxZoom: 19,
      scrollWheelZoom: false,
      touchZoom: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
    }).setView(
      ll(props.center),
      props.initialZoom ?? 16
    )
    L.control.zoom({ position: "bottomright" }).addTo(map)
    // Credits as a small label in the bottom-left corner (styled in globals.css),
    // clear of the zoom buttons.
    L.control.attribution({ position: "bottomleft", prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(map)
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 19,
      maxZoom: 19,
      attribution: "&copy; Esri, Maxar, Earthstar Geographics | &copy; OpenStreetMap contributors",
    }).addTo(map)
    map.on("zoomend", () => cb.current.onZoomChange?.(map.getZoom()))
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      map.setZoom(map.getZoom() + (e.deltaY < 0 ? 0.5 : -0.5))
    }
    map.getContainer().addEventListener("wheel", onWheel, { passive: false })
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
      map.getContainer().removeEventListener("wheel", onWheel)
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
      L.polygon(f.ring.map(ll), { ...featureStyle(f.kind), interactive: false }).addTo(g)
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
        color: selected ? readColor("map-aim") : readColor("map-marker"),
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
    upsert("ball", props.ball, markerIcon("ball"), (p) => cb.current.onBall(p))
    upsert("aim", props.aim, markerIcon("aim"), (p) => cb.current.onAim(p))
    upsert("pin", props.pin, markerIcon("pin"), (p) => cb.current.onPin(p))

    l.path?.remove()
    l.path = undefined
    l.pinPath?.remove()
    l.pinPath = undefined
    // aim -> pin: what is left after a shot that lands on the aim point
    if (props.aim && props.pin) {
      l.pinPath = L.polyline([ll(props.aim), ll(props.pin)], {
        color: readColor("map-marker"),
        weight: 2,
        opacity: 0.8,
        dashArray: "2 6",
        interactive: false,
      }).addTo(map)
    }
    if (props.ball && props.aim) {
      l.path = L.polyline([ll(props.ball), ll(props.aim)], {
        color: readColor("map-aim"),
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
        fillColor: readColor(c.color),
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
        color: readColor(LIE_TOKEN[z.lie]),
        weight: 2,
        opacity: 0.9,
        fillColor: readColor(LIE_TOKEN[z.lie]),
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
    const color = readColor(props.drawKind ? LIE_TOKEN[props.drawKind] : "map-aim")
    if (pts.length > 0) {
      L.polyline(pts.map(ll), { color, weight: 2, interactive: false }).addTo(g)
      if (pts.length >= 3) {
        L.polyline([ll(pts[pts.length - 1]), ll(pts[0])], { color, weight: 2, dashArray: "4 4", opacity: 0.7, interactive: false }).addTo(g)
      }
      pts.forEach((p, i) => {
        // The first vertex is drawn bigger: tapping it (or near it, on a touchscreen) closes the shape.
        L.circleMarker(ll(p), {
          radius: i === 0 && pts.length >= 3 ? 9 : 5,
          color: readColor("map-ink"),
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
        color: readColor("map-marker"),
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
          html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;padding:2px 7px;border-radius:9999px;background:${cssColor("map-scrim", 0.82)};border:1px solid ${cssColor("map-marker", 0.35)};font:600 11px system-ui;color:${cssColor("map-marker")}">${lab.text}</div>`,
        }),
      }).addTo(g)
    }
  }, [props.labels])

  // Simulated shots: a dot where each one stops, plus (optionally) a hollow
  // ring where it first landed.
  useEffect(() => {
    const g = layers.current?.landings
    if (!g) return
    g.clearLayers()
    if (props.showCarry) {
      for (const s of props.landings) {
        L.circleMarker(ll(s.carryPoint), {
          radius: 2.5,
          color: readColor(LIE_TOKEN[s.carryLie]),
          weight: 1,
          fill: false,
          opacity: 0.8,
          interactive: false,
        }).addTo(g)
      }
    }
    for (const s of props.landings) {
      L.circleMarker(ll(s.point), {
        radius: 3,
        color: readColor("map-ink"),
        weight: 0.5,
        fillColor: readColor(LIE_TOKEN[s.lie]),
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(g)
    }
  }, [props.landings, props.showCarry])

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
      <span className="absolute top-0.5 text-[8px] font-bold text-gray-400">N</span>
      <div className="relative h-7 w-7" style={{ transform: `rotate(${bearingDeg}deg)` }}>
        <svg viewBox="0 0 24 24" className="h-full w-full">
          <path d="M12 1 L17 15 L12 11.5 L7 15 Z" style={{ fill: cssColor("map-aim") }} />
          <path d="M12 23 L9 13 L12 15.5 L15 13 Z" style={{ fill: cssColor("map-dim") }} />
        </svg>
      </div>
    </div>
  )
}
