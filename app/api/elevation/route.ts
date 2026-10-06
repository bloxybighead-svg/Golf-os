import { NextRequest, NextResponse } from "next/server"
import { ELEVATION_MAX_POINTS, samePoints } from "@/lib/course/elevation"
import { lookupElevations } from "@/lib/course/elevationSources"
import { courseKey } from "@/lib/supabase/courseCache"
import { readCachedElevation, writeCachedElevation } from "@/lib/supabase/elevationCache"
import { clientIp, hitRateLimit, rateLimitBucket, RATE_LIMITS, rateLimitedResponse } from "@/lib/supabase/rateLimit"

// Ground height in feet for up to ELEVATION_MAX_POINTS points. USGS EPQS where it
// covers (US), Open-Meteo elsewhere. With a courseId and holeId the answer is kept in
// Supabase (course_elevation) and served from there next time: it is matched by the
// POINTS, so a request can never make a hole's cache answer for a different place.
// A cache hit costs nothing against the rate limit; only a real lookup does.
export const maxDuration = 30

interface Body {
  courseId?: unknown
  holeId?: unknown
  points?: unknown
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }
  const raw = body.points
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > ELEVATION_MAX_POINTS) {
    return NextResponse.json({ error: `Send 1 to ${ELEVATION_MAX_POINTS} points.` }, { status: 400 })
  }
  const points = raw.map((p) => ({ lat: Number((p as { lat?: unknown })?.lat), lng: Number((p as { lng?: unknown })?.lng) }))
  if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) {
    return NextResponse.json({ error: "Every point needs a lat and lng." }, { status: 400 })
  }
  const key = courseKey(typeof body.courseId === "string" ? body.courseId : null)
  const holeId = typeof body.holeId === "string" && body.holeId.length <= 64 ? body.holeId : null

  if (key && holeId) {
    const cached = await readCachedElevation(key, holeId)
    if (cached && samePoints(cached.points, points) && cached.elevationsFt.length === points.length) {
      return NextResponse.json({ elevationsFt: cached.elevationsFt, source: cached.source, cache: "supabase" }, { headers: { "Cache-Control": "no-store" } })
    }
  }

  const limit = await hitRateLimit("elevation", rateLimitBucket("elevation", { ip: clientIp(req.headers) }))
  if (!limit.allowed) {
    return rateLimitedResponse(limit, "Too many elevation lookups. Holes already looked up still work; try again in a minute.", RATE_LIMITS.elevation.windowSeconds)
  }
  const found = await lookupElevations(points)
  if (!found) return NextResponse.json({ error: "Elevation service is busy, try again in a moment." }, { status: 502 })
  let write = "not-attempted"
  if (key && holeId) write = await writeCachedElevation(key, holeId, { points, elevationsFt: found.elevationsFt, source: found.source })
  return NextResponse.json(
    { elevationsFt: found.elevationsFt, source: found.source, cache: write === "stored" ? "miss-stored" : "miss" },
    { headers: { "Cache-Control": "no-store", "X-Elevation-Cache-Write": write.replace(/[^ -~]/g, " ") } }
  )
}
