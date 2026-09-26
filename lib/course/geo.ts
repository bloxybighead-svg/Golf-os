// Small-area geodesy for course maps. A golf hole is a few hundred yards
// across, so a flat local projection (equirectangular around a reference
// point) is accurate to well under a yard -- no map library needed for the
// math, and everything stays testable without a browser.

export interface LatLng {
  lat: number
  lng: number
}

export interface XY {
  x: number // yards east of the origin
  y: number // yards north of the origin
}

const METERS_PER_YARD = 0.9144
const EARTH_RADIUS_M = 6371008.8
const YARDS_PER_DEG_LAT = ((Math.PI / 180) * EARTH_RADIUS_M) / METERS_PER_YARD

export function yardsPerDegLng(atLat: number): number {
  return YARDS_PER_DEG_LAT * Math.cos((atLat * Math.PI) / 180)
}

export function toLocal(origin: LatLng, p: LatLng): XY {
  return {
    x: (p.lng - origin.lng) * yardsPerDegLng(origin.lat),
    y: (p.lat - origin.lat) * YARDS_PER_DEG_LAT,
  }
}

export function fromLocal(origin: LatLng, p: XY): LatLng {
  return {
    lat: origin.lat + p.y / YARDS_PER_DEG_LAT,
    lng: origin.lng + p.x / yardsPerDegLng(origin.lat),
  }
}

export function distanceYds(a: LatLng, b: LatLng): number {
  const d = toLocal(a, b)
  return Math.hypot(d.x, d.y)
}

/** Compass bearing from a to b in degrees clockwise from north, 0-360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const d = toLocal(a, b)
  const deg = (Math.atan2(d.x, d.y) * 180) / Math.PI
  return (deg + 360) % 360
}

/**
 * Where a shot lands. The golfer stands at `from`, aims along
 * `aimBearingDeg`, and the shot travels `carryYds` along that line and
 * `offlineYds` sideways (right positive, left negative -- same convention
 * as the simulator's shot data).
 */
export function landingPoint(from: LatLng, aimBearingDeg: number, carryYds: number, offlineYds: number): LatLng {
  const t = (aimBearingDeg * Math.PI) / 180
  const east = carryYds * Math.sin(t) + offlineYds * Math.cos(t)
  const north = carryYds * Math.cos(t) - offlineYds * Math.sin(t)
  return fromLocal(from, { x: east, y: north })
}

/** Even-odd ray-casting point-in-polygon on a closed or open ring of XY points. */
export function pointInRing(x: number, y: number, ring: XY[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x
    const yi = ring[i].y
    const xj = ring[j].x
    const yj = ring[j].y
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function ringCentroid(ring: LatLng[]): LatLng {
  // Vertex mean is plenty for placing a default pin in a green-sized polygon.
  let lat = 0
  let lng = 0
  for (const p of ring) {
    lat += p.lat
    lng += p.lng
  }
  return { lat: lat / ring.length, lng: lng / ring.length }
}

export function lineLengthYds(line: LatLng[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) total += distanceYds(line[i - 1], line[i])
  return total
}

/** The point `distYds` along a polyline from its start (clamped to the end). */
export function pointAlongLine(line: LatLng[], distYds: number): LatLng {
  let remaining = Math.max(0, distYds)
  for (let i = 1; i < line.length; i++) {
    const seg = distanceYds(line[i - 1], line[i])
    if (remaining <= seg && seg > 0) {
      const t = remaining / seg
      return {
        lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * t,
        lng: line[i - 1].lng + (line[i].lng - line[i - 1].lng) * t,
      }
    }
    remaining -= seg
  }
  return line[line.length - 1]
}
