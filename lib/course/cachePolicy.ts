// Whether a freshly fetched course map may be written to the SHARED geometry
// cache (every user reads it for 90 days), so it has to be the right course.

/** Most a browser-sent position may differ from the server's own record. A course is ~1-2 km across. */
export const MAX_CLIENT_SERVER_DISTANCE_M = 2000 // source: task spec (2 km)

export interface CacheWriteInput {
  /** The request named a course id (radius searches have none). */
  hasId: boolean
  /** The course's location looked up on the server from that id; null if the lookup failed. */
  server: { lat: number; lng: number } | null
  /** What the browser sent. */
  client: { lat: number; lng: number }
  holes: number
  scope: string
}

export type CacheWriteDecision = { write: true } | { write: false; reason: string }

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function decideCacheWrite(i: CacheWriteInput): CacheWriteDecision {
  if (!i.hasId) return { write: false, reason: "no-id" }
  if (!i.server) return { write: false, reason: "lookup-failed" }
  if (i.scope !== "course-area") return { write: false, reason: "not-course-area" }
  // Only plausible single courses: a boundary that swallows several courses would be served as wrong data.
  if (i.holes !== 9 && i.holes !== 18) return { write: false, reason: "implausible-hole-count" }
  const off = distanceM(i.client, i.server)
  if (off > MAX_CLIENT_SERVER_DISTANCE_M) return { write: false, reason: `client-location-${Math.round(off)}m-from-course` }
  return { write: true }
}
