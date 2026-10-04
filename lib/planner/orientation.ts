// Orienting and fitting the Play map to a hole: tee at the bottom, green at the
// top, everything in view with padding. Pure math, no Leaflet -- the map
// component only applies what this returns. The rotation itself is a CSS
// rotation of the map element; `unrotate` is the inverse that turns a screen
// offset back into the map's own (north-up) pixel offset, so taps and drags
// still land where the golfer touched.

import { fromLocal, toLocal, type LatLng } from "@/lib/course/geo"

/** Blank space left around the fitted hole on every side, in screen pixels. Estimate: enough that a finger on the edge never covers the tee or green. */
export const FIT_PADDING_PX = 36
/** Tightest and widest zoom the fit may pick. 15 lets a long par 5 fit a short phone map; 19 is the imagery's last real zoom. */
export const FIT_MIN_ZOOM = 15
export const FIT_MAX_ZOOM = 19
/** Smallest extent the fit will frame, so a one-point "hole" does not zoom to the tiles' limit. Estimate: about one chip shot. */
const MIN_EXTENT_M = 40
const YARDS_TO_M = 0.9144
/** Metres per pixel at zoom 0 on the equator for 256px Web Mercator tiles (the Esri imagery's grid). */
const M_PER_PX_Z0 = 156543.03392
/** The map snaps to half zoom levels (Leaflet zoomSnap in CourseMap). */
const ZOOM_STEP = 0.5

const rad = (d: number) => (d * Math.PI) / 180

/** Wraps degrees to (-180, 180]. */
export function wrapDeg(d: number): number {
  const w = ((((d + 180) % 360) + 360) % 360) - 180
  return w === -180 ? 180 : w
}

/** The CSS rotation (degrees, clockwise) that turns a hole playing at `bearing` to point up the screen. */
export function rotationForBearing(bearing: number): number {
  return wrapDeg(-bearing)
}

/** Metres per screen pixel at a zoom and latitude. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (M_PER_PX_Z0 * Math.cos(rad(lat))) / 2 ** zoom
}

/** Yards per screen pixel at a zoom and latitude. */
export function yardsPerPixel(zoom: number, lat: number): number {
  return metersPerPixel(zoom, lat) / YARDS_TO_M
}

/**
 * A screen-space vector (x right, y down, from the map's centre) turned back
 * through the map's CSS rotation: the vector in the map element's own pixels.
 */
export function unrotate(dx: number, dy: number, rotationDeg: number): { x: number; y: number } {
  const t = rad(-rotationDeg)
  return { x: dx * Math.cos(t) - dy * Math.sin(t), y: dx * Math.sin(t) + dy * Math.cos(t) }
}

/** The forward rotation (map pixels to screen pixels), the inverse of `unrotate`. */
export function rotate(x: number, y: number, rotationDeg: number): { x: number; y: number } {
  return unrotate(x, y, -rotationDeg)
}

export interface FitView {
  center: LatLng
  zoom: number
}

/**
 * The centre and zoom that frame `points` inside a `viewport`-pixel window with
 * the hole's bearing pointing up. Works in the rotated frame, so a diagonal hole
 * is framed by its rotated extent, not its north-up bounding box.
 */
export function fitView(
  points: LatLng[],
  bearing: number,
  viewport: { w: number; h: number },
  opts: { padding?: number; minZoom?: number; maxZoom?: number } = {}
): FitView | null {
  if (points.length === 0 || viewport.w <= 0 || viewport.h <= 0) return null
  const padding = opts.padding ?? FIT_PADDING_PX
  const origin = points[0]
  const b = rad(bearing)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    const l = toLocal(origin, p)
    const rx = l.x * Math.cos(b) - l.y * Math.sin(b)
    const ry = l.x * Math.sin(b) + l.y * Math.cos(b)
    minX = Math.min(minX, rx)
    maxX = Math.max(maxX, rx)
    minY = Math.min(minY, ry)
    maxY = Math.max(maxY, ry)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const center = fromLocal(origin, { x: cx * Math.cos(b) + cy * Math.sin(b), y: -cx * Math.sin(b) + cy * Math.cos(b) })

  const extentW = Math.max((maxX - minX) * YARDS_TO_M, MIN_EXTENT_M)
  const extentH = Math.max((maxY - minY) * YARDS_TO_M, MIN_EXTENT_M)
  const availW = Math.max(viewport.w - 2 * padding, 40)
  const availH = Math.max(viewport.h - 2 * padding, 40)
  const k = M_PER_PX_Z0 * Math.cos(rad(center.lat))
  const z = Math.min(Math.log2((k * availW) / extentW), Math.log2((k * availH) / extentH))
  const snapped = Math.floor(z / ZOOM_STEP) * ZOOM_STEP
  const zoom = Math.min(opts.maxZoom ?? FIT_MAX_ZOOM, Math.max(opts.minZoom ?? FIT_MIN_ZOOM, snapped))
  return { center, zoom }
}

/** Asks the map to frame some points. `bearingDeg`: a number = orient that way (tee below, green above), null = north-up, undefined = keep the current rotation. */
export interface FitRequest {
  points: LatLng[]
  bearingDeg?: number | null
  key: string
}
