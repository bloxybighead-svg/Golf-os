"use client"

// Leaflet map over satellite imagery. All course math lives in lib/course;
// this component only draws and reports drags/clicks back up. Imported with
// next/dynamic (ssr: false) because Leaflet touches `window` on import.

import { useCallback, useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { LocateFixed, Minus, Plus } from "lucide-react"
import { distanceYds, ringCentroid, type LatLng } from "@/lib/course/geo"
import { fitView, rotationForBearing, unrotate, wrapDeg, yardsPerPixel, type FitRequest } from "@/lib/planner/orientation"
import { placeLabel } from "@/lib/planner/labelPlacement"
import type { Lie, UserZone } from "@/lib/course/lies"
import type { CourseGeometry, FeatureKind, LineKind } from "@/lib/course/overpass"
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

// ---- rotation ----
// The map is turned with a CSS rotation of its container (tee at the bottom, green
// at the top). Leaflet reads taps and drags in the container's own unrotated pixels,
// so two places are taught the rotation: where a pointer event lands
// (map.mouseEventToContainerPoint, patched per map below) and how far a drag moved
// (Draggable._onMove, which pans the map and drags markers). Both use
// lib/planner/orientation's unrotate, which is unit-tested; everything else in
// Leaflet works in container pixels and is untouched.
let activeRotation = 0
const draggableProto = L.Draggable.prototype as unknown as {
  _onMove: (e: unknown) => void
  _parentScale: { x: number; y: number }
  _startPoint: { x: number; y: number }
  __rotated?: boolean
}
if (!draggableProto.__rotated) {
  const originalMove = draggableProto._onMove
  draggableProto._onMove = function (this: typeof draggableProto, e: unknown) {
    const ev = e as { touches?: { clientX: number; clientY: number }[]; clientX: number; clientY: number; target?: EventTarget | null; type?: string; preventDefault: () => void }
    if (!activeRotation || (ev.touches && ev.touches.length > 1)) return originalMove.call(this, e)
    const t = ev.touches && ev.touches.length === 1 ? ev.touches[0] : ev
    const s0 = this._startPoint
    const v = unrotate(t.clientX - s0.x, t.clientY - s0.y, activeRotation)
    const point = { clientX: s0.x + v.x, clientY: s0.y + v.y }
    this._parentScale = { x: 1, y: 1 } // a rotation does not scale; the bounding box Leaflet measured would
    const fake = { ...point, touches: ev.touches ? [point] : undefined, target: ev.target, srcElement: ev.target, type: ev.type, preventDefault: () => ev.preventDefault() }
    return originalMove.call(this, fake)
  }
  draggableProto.__rotated = true
}

/** Two-finger twist must turn this far before it starts rotating the map (so a plain pinch-zoom never nudges it). Estimate. */
const ROTATE_DEADZONE_DEG = 8
/** Shift + wheel turns the map this many degrees per notch (desktop). Estimate. */
const WHEEL_ROTATE_DEG = 5

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
  building: { token: "lie-oob", weight: 1, fillOpacity: 0.3 },
  scrub: { token: "lie-trees", weight: 1, fillOpacity: 0.1, dashArray: "3 4" },
  residential: { token: "lie-trees", weight: 0.5, fillOpacity: 0.05, dashArray: "2 6" },
}

// Roads and tree rows are centre lines; the course boundary is drawn as a faint outline.
const LINE_STYLE: Record<LineKind, { token: string; weight: number; opacity: number; dashArray?: string }> = {
  road: { token: "lie-oob", weight: 3, opacity: 0.45 },
  treeRow: { token: "lie-trees", weight: 4, opacity: 0.35 },
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
  /** Distance labels: each belongs on the line from `from` to `to`; the map slides it off the green. */
  labels: { from: LatLng; to: LatLng; text: string }[]
  cells: { sw: LatLng; ne: LatLng; color: string; opacity: number }[]
  rings: LatLng[][]
  zones: UserZone[]
  /** Where the golfer's OB tags put the stakes: solid red lines. */
  obEdges?: LatLng[][]
  /** Hand-marking mode: while set, taps add vertices instead of moving ball/aim/pin. */
  drawKind: Lie | null
  pendingPoints: LatLng[]
  placing: Placing
  /** What to frame (a hole, a course, the ball and pin). Applied again whenever `fitKey` changes. */
  fit: FitRequest | null
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
const UPRIGHT = "transform:rotate(var(--unrot,0deg))" // keeps a marker upright when the map is turned

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
      html: `<div style="width:${hit}px;height:${hit}px;display:flex;align-items:center;justify-content:center;${UPRIGHT}"><div style="width:${d}px;height:${d}px;border-radius:50%;background:${cssColor("map-marker")};box-shadow:0 0 0 2px ${edge},0 2px 5px ${cssColor("map-scrim", 0.5)}"></div></div>`,
    })
  }

  if (kind === "aim") {
    const s = coarse ? 34 : 26
    const lines = "M12 1V7M12 17V23M1 12H7M17 12H23"
    return L.divIcon({
      className: "",
      iconSize: [hit, hit],
      iconAnchor: [hit / 2, hit / 2],
      html: `<div style="width:${hit}px;height:${hit}px;display:flex;align-items:center;justify-content:center;${UPRIGHT}"><svg width="${s}" height="${s}" viewBox="0 0 24 24" style="overflow:visible"><g style="fill:none;stroke:${edge};stroke-width:4;stroke-linecap:round"><circle cx="12" cy="12" r="6.5"/><path d="${lines}"/></g><g style="fill:none;stroke:${cssColor("map-aim")};stroke-width:2;stroke-linecap:round"><circle cx="12" cy="12" r="6.5"/><path d="${lines}"/></g><circle cx="12" cy="12" r="1.6" style="fill:${cssColor("map-aim")}"/></svg></div>`,
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
    html: `<svg width="${w}" height="${h}" viewBox="0 0 24 32" style="overflow:visible;display:block;${UPRIGHT};transform-origin:${(7 / 24) * 100}% ${(31 / 32) * 100}%"><ellipse cx="7" cy="31" rx="4" ry="1.5" style="fill:${cssColor("map-scrim", 0.7)}"/><path d="M7 31V2" style="stroke:${edge};stroke-width:4;stroke-linecap:round"/><path d="M8 2.5L21 7.5L8 12.5Z" style="fill:${cssColor("lie-oob")};stroke:${edge};stroke-width:1.5;stroke-linejoin:round"/><path d="M7 31V2" style="stroke:${cssColor("map-marker")};stroke-width:2;stroke-linecap:round"/></svg>`,
  })
}

export default function CourseMap(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
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

  // ---- view: rotation, fit, re-center ----
  const sizeRef = useRef({ w: 0, h: 0 })
  const rotRef = useRef(0)
  const pendingFit = useRef(false)
  const programmatic = useRef(false) // true while the map moves itself, so it is not mistaken for the golfer moving it
  const lastFit = useRef<{ req: FitRequest; autoRot: number } | null>(null)
  // A rotation the golfer chose on a hole, kept for that hole until they re-center.
  const rotMemory = useRef(new Map<string, number>())
  const [rotation, setRotationState] = useState(0)
  const [viewDirty, setViewDirty] = useState(false) // the golfer moved the view off the auto fit
  const [zoomTick, setZoomTick] = useState(0) // bumps on every zoom: labels re-place, the zoom buttons re-check their limits

  const setRotation = useCallback((deg: number) => {
    const d = wrapDeg(deg)
    rotRef.current = d
    activeRotation = d
    const c = containerRef.current
    if (c) {
      c.style.transform = d ? `rotate(${d}deg)` : ""
      c.style.setProperty("--unrot", `${-d}deg`)
    }
    setRotationState(d)
  }, [])

  const runFit = useCallback(
    (req: FitRequest | null | undefined, opts: { ignoreMemory?: boolean } = {}) => {
      const map = mapRef.current
      if (!map || !req) return
      const { w, h } = sizeRef.current
      if (w <= 0 || h <= 0) {
        pendingFit.current = true // the map is not laid out yet (hidden, or first paint): fit when it is
        lastFit.current = { req, autoRot: lastFit.current?.autoRot ?? 0 }
        return
      }
      pendingFit.current = false
      const autoRot = req.bearingDeg === undefined ? rotRef.current : req.bearingDeg === null ? 0 : rotationForBearing(req.bearingDeg)
      const remembered = opts.ignoreMemory ? undefined : rotMemory.current.get(req.key)
      const rot = remembered ?? autoRot
      const view = fitView(req.points, -rot, { w, h })
      if (!view) return
      setRotation(rot)
      programmatic.current = true
      map.setView([view.center.lat, view.center.lng], view.zoom, { animate: false })
      programmatic.current = false
      lastFit.current = { req, autoRot }
      setViewDirty(remembered != null && remembered !== autoRot)
    },
    [setRotation]
  )

  const userRotate = useCallback(
    (deg: number) => {
      setRotation(deg)
      setViewDirty(true)
      const key = lastFit.current?.req.key
      if (key?.startsWith("hole-")) rotMemory.current.set(key, rotRef.current)
    },
    [setRotation]
  )

  const recenter = useCallback(() => {
    const key = lastFit.current?.req.key
    if (key) rotMemory.current.delete(key)
    runFit(lastFit.current?.req, { ignoreMemory: true })
    setViewDirty(false)
  }, [runFit])

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || !wrapRef.current || mapRef.current) return
    const wrap = wrapRef.current
    // Wheel-zoom is off so scrolling the page over the map does not hijack it; Ctrl/Cmd + wheel zooms
    // (touch devices get pinch-to-zoom, Leaflet's default, regardless). Zoom buttons, credits and
    // the compass are drawn outside the (rotating) map element, below.
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      minZoom: 15,
      maxZoom: 19,
      scrollWheelZoom: false,
      touchZoom: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
    }).setView(
      ll(props.center),
      props.initialZoom ?? 16
    )
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 19,
      maxZoom: 19,
    }).addTo(map)

    // Taps and drags through the rotation (see the note at the top of the file).
    const originalToContainerPoint = map.mouseEventToContainerPoint.bind(map)
    map.mouseEventToContainerPoint = (e: { clientX: number; clientY: number }) => {
      if (!rotRef.current) return originalToContainerPoint(e as MouseEvent)
      const c = map.getContainer()
      const rect = c.getBoundingClientRect() // the rotated box's bounding rect: its centre is still the element's centre
      const v = unrotate(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2), rotRef.current)
      return L.point(v.x + c.clientWidth / 2, v.y + c.clientHeight / 2)
    }

    // The map element is a square wide enough to cover the window at any rotation, centred on it.
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      sizeRef.current = { w: r.width, h: r.height }
      const c = containerRef.current
      if (!c || r.width <= 0 || r.height <= 0) return
      const d = Math.ceil(Math.hypot(r.width, r.height))
      c.style.width = `${d}px`
      c.style.height = `${d}px`
      c.style.left = `${(r.width - d) / 2}px`
      c.style.top = `${(r.height - d) / 2}px`
      programmatic.current = true
      map.invalidateSize({ animate: false })
      programmatic.current = false
      if (pendingFit.current) runFit(lastFit.current?.req)
    })
    ro.observe(wrap)

    map.on("zoomend", () => {
      cb.current.onZoomChange?.(map.getZoom())
      setZoomTick((n) => n + 1)
    })
    map.on("zoomstart", () => {
      if (!programmatic.current) setViewDirty(true)
    })
    map.on("dragstart", () => setViewDirty(true))
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        userRotate(rotRef.current + (e.deltaY < 0 ? -WHEEL_ROTATE_DEG : WHEEL_ROTATE_DEG))
        return
      }
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      map.setZoom(map.getZoom() + (e.deltaY < 0 ? 0.5 : -0.5))
    }
    wrap.addEventListener("wheel", onWheel, { passive: false })

    // Two-finger twist rotates the map; the pinch still zooms (Leaflet's own).
    let lastAngle: number | null = null
    let twisted = 0
    let engaged = false
    const angleOf = (t: TouchList) => (Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX) * 180) / Math.PI
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastAngle = angleOf(e.touches)
        twisted = 0
        engaged = false
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastAngle == null) return
      const a = angleOf(e.touches)
      let delta = wrapDeg(a - lastAngle)
      lastAngle = a
      twisted += delta
      if (!engaged && Math.abs(twisted) >= ROTATE_DEADZONE_DEG) {
        engaged = true
        delta = twisted
      }
      if (engaged) userRotate(rotRef.current + delta)
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) lastAngle = null
    }
    wrap.addEventListener("touchstart", onTouchStart, { passive: true })
    wrap.addEventListener("touchmove", onTouchMove, { passive: true })
    wrap.addEventListener("touchend", onTouchEnd, { passive: true })

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
      ro.disconnect()
      wrap.removeEventListener("wheel", onWheel)
      wrap.removeEventListener("touchstart", onTouchStart)
      wrap.removeEventListener("touchmove", onTouchMove)
      wrap.removeEventListener("touchend", onTouchEnd)
      activeRotation = 0
      map.remove()
      mapRef.current = null
      layers.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Course polygons, roads and tree rows, and the course boundary.
  useEffect(() => {
    const g = layers.current?.features
    if (!g) return
    g.clearLayers()
    for (const ring of props.geometry?.boundary?.outer ?? []) {
      L.polyline(ring.map(ll), { color: readColor("lie-oob"), weight: 1.5, opacity: 0.5, dashArray: "8 6", interactive: false }).addTo(g)
    }
    for (const f of props.geometry?.features ?? []) {
      L.polygon(f.ring.map(ll), { ...featureStyle(f.kind), interactive: false }).addTo(g)
    }
    for (const l of props.geometry?.lines ?? []) {
      const { token, ...rest } = LINE_STYLE[l.kind]
      L.polyline(l.line.map(ll), { ...rest, color: readColor(token), interactive: false }).addTo(g)
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
      line.bindTooltip(`<span style="display:inline-block;${UPRIGHT}">${h.ref ?? "?"}${h.par ? ` · par ${h.par}` : ""}</span>`, { sticky: true })
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
    // OB the golfer tagged on this hole: the stakes as a solid red line.
    for (const edge of props.obEdges ?? []) {
      if (edge.length >= 2) L.polyline(edge.map(ll), { color: readColor("lie-oob"), weight: 3, opacity: 0.95, interactive: false }).addTo(g)
    }
  }, [props.zones, props.obEdges])

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

  // Yardage labels on the ball->aim and aim->pin lines, slid off the green and the pin so they never cover the target.
  useEffect(() => {
    const g = layers.current?.labels
    const map = mapRef.current
    if (!g || !map) return
    g.clearLayers()
    const pin = props.pin
    const greens = (props.geometry?.features ?? [])
      .filter((f) => f.kind === "green" && (!pin || distanceYds(ringCentroid(f.ring), pin) < 80))
      .map((f) => f.ring)
    const avoid = { rings: greens, points: pin ? [pin] : [] }
    const ypp = yardsPerPixel(map.getZoom(), map.getCenter().lat)
    for (const lab of props.labels) {
      L.marker(ll(placeLabel(lab.from, lab.to, avoid, ypp)), {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          iconSize: [0, 0],
          html: `<div style="transform:translate(-50%,-50%) rotate(var(--unrot,0deg));white-space:nowrap;padding:2px 7px;border-radius:9999px;background:${cssColor("map-scrim", 0.82)};border:1px solid ${cssColor("map-marker", 0.35)};font:600 11px system-ui;color:${cssColor("map-marker")}">${lab.text}</div>`,
        }),
      }).addTo(g)
    }
  }, [props.labels, props.pin, props.geometry, zoomTick])

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

  // Frame the course, hole or ball when asked (a new fitKey): the hole turned tee-down, green-up.
  useEffect(() => {
    runFit(props.fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey])

  void zoomTick
  const zoom = mapRef.current?.getZoom() ?? props.initialZoom ?? 16
  const glass = "flex h-11 w-11 items-center justify-center rounded-lg border border-white/25 bg-black/60 text-white backdrop-blur-sm disabled:opacity-30"

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" style={{ cursor: props.drawKind ? "crosshair" : undefined }} />
      {props.holeBearingDeg != null && <CompassOverlay rotationDeg={rotation} />}
      <div className="absolute bottom-6 right-2 z-[1050] flex flex-col gap-2">
        {viewDirty && (
          <button type="button" onClick={recenter} aria-label="Re-center on the hole" title="Re-center" className={glass}>
            <LocateFixed size={18} />
          </button>
        )}
        <button type="button" onClick={() => mapRef.current?.zoomIn(1)} disabled={zoom >= 19} aria-label="Zoom in" className={glass}>
          <Plus size={18} />
        </button>
        <button type="button" onClick={() => mapRef.current?.zoomOut(1)} disabled={zoom <= 15} aria-label="Zoom out" className={glass}>
          <Minus size={18} />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-0 right-0 z-[1050] max-w-full truncate bg-black/50 px-1.5 py-px text-[9px] text-white/80">
        © Esri, Maxar, Earthstar Geographics | © OpenStreetMap contributors
      </p>
    </div>
  )
}

// Which way north is now that the map is turned: a small compass whose N follows the
// rotation, with the hole's direction always straight up. Lives outside Leaflet's own
// DOM, so it can't interfere with the map's click and drag math.
function CompassOverlay({ rotationDeg }: { rotationDeg: number }) {
  return (
    <div
      className="pointer-events-none absolute right-2 top-2 z-[1050] flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/60 backdrop-blur-sm"
      title={`North is ${Math.round(((rotationDeg % 360) + 360) % 360)}° clockwise from the top`}
    >
      <div className="absolute inset-0" style={{ transform: `rotate(${rotationDeg}deg)` }}>
        <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[9px] font-bold leading-none text-white">N</span>
      </div>
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path d="M12 3 L17 17 L12 13.5 L7 17 Z" style={{ fill: cssColor("map-aim") }} />
      </svg>
    </div>
  )
}
