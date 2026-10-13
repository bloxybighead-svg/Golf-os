import { NextRequest, NextResponse } from "next/server"
import { clientIp, hitRateLimit, rateLimitBucket, rateLimitedResponse } from "@/lib/supabase/rateLimit"

// Proxies OpenGolfAPI's course search so the browser never talks to a
// third-party host directly (keeps it server-controlled, avoids CORS).
// Free, keyless, ODbL-licensed: https://opengolfapi.org/
const OPENGOLFAPI_BASE = "https://api.opengolfapi.org/api/v1"
/** How far "Use my location" looks. Estimate: a golfer's usual drive to a course. */
const NEARBY_RADIUS_MI = 25
const NEARBY_LIMIT = 15

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  // ?lat=&lng= lists courses near a point, nearest first, instead of searching by name.
  const lat = Number(req.nextUrl.searchParams.get("lat"))
  const lng = Number(req.nextUrl.searchParams.get("lng"))
  const near = req.nextUrl.searchParams.has("lat") && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  if (!near && (!q || q.length < 2)) {
    return NextResponse.json({ courses: [] })
  }
  const limit = await hitRateLimit("search", rateLimitBucket("search", { ip: clientIp(req.headers) }))
  if (!limit.allowed) return rateLimitedResponse(limit, "Too many course searches. Try again in a minute.", 60)

  const query = near ? `lat=${lat}&lng=${lng}&radius_mi=${NEARBY_RADIUS_MI}&limit=${NEARBY_LIMIT}` : `q=${encodeURIComponent(q!)}`
  const res = await fetch(`${OPENGOLFAPI_BASE}/courses/search?${query}`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    return NextResponse.json({ error: "Course search failed" }, { status: 502 })
  }
  const data = await res.json()
  // OpenGolfAPI's `name` field isn't reliably populated (missing for some
  // courses, e.g. multi-word queries like "Spyglass Hill" only return
  // `course_name`) -- that field is present on every result seen so far.
  const courses = (data.courses ?? [])
    .slice(0, 15)
    .map((c: { id: string; name?: string; course_name?: string; city: string | null; state: string | null; par: number | null; lat?: number | null; lng?: number | null; distance_mi?: number }) => ({
      id: c.id,
      name: c.course_name ?? c.name ?? "Unnamed course",
      city: c.city,
      state: c.state,
      par: c.par,
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      distanceMi: c.distance_mi ?? null,
    }))
  return NextResponse.json({ courses })
}
