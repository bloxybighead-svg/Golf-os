// A course's real location, looked up on the server from its OpenGolfAPI id.
// The geometry route uses this instead of the browser's lat/lng whenever it
// is going to write to the shared cache, so a client can't get one course's
// map stored under another course's id.
// Free, keyless, ODbL-licensed: https://opengolfapi.org/

const OPENGOLFAPI_BASE = "https://api.opengolfapi.org/api/v1"
const LOOKUP_REVALIDATE_S = 86400 // a course doesn't move
const LOOKUP_TIMEOUT_MS = 8000 // estimate: keep a slow API from eating the route's 52 s budget

export interface CourseLocation {
  lat: number
  lng: number
  name: string | undefined
}

/** The ids OpenGolfAPI uses (UUIDs). Anything else is never forwarded as a URL. */
const ID_PATTERN = /^[0-9a-f-]{8,64}$/i

export function parseCourseLocation(raw: unknown): CourseLocation | null {
  const c = (raw ?? {}) as { lat?: unknown; lng?: unknown; course_name?: unknown; name?: unknown }
  const lat = typeof c.lat === "number" ? c.lat : NaN
  const lng = typeof c.lng === "number" ? c.lng : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const name = typeof c.course_name === "string" && c.course_name ? c.course_name : typeof c.name === "string" && c.name ? c.name : undefined
  return { lat, lng, name: name?.slice(0, 120) }
}

/** null when the id is malformed, unknown, or OpenGolfAPI is unreachable. */
export async function getCourseLocation(id: string): Promise<CourseLocation | null> {
  if (!ID_PATTERN.test(id)) return null
  try {
    const res = await fetch(`${OPENGOLFAPI_BASE}/courses/${encodeURIComponent(id)}`, {
      next: { revalidate: LOOKUP_REVALIDATE_S },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return parseCourseLocation(await res.json())
  } catch {
    return null
  }
}
