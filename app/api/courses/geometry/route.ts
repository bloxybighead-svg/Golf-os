import { NextRequest, NextResponse } from "next/server"
import { decideCacheWrite } from "@/lib/course/cachePolicy"
import { applyCorrections } from "@/lib/course/corrections"
import { getCourseLocation } from "@/lib/courses/lookup"
import { courseKey, readCachedGeometry, writeCachedGeometry } from "@/lib/supabase/courseCache"
import { readCorrections } from "@/lib/supabase/courseCorrections"
import { createClient } from "@/lib/supabase/server"
import { hitRateLimit, rateLimitBucket, RATE_LIMITS, rateLimitedResponse } from "@/lib/supabase/rateLimit"
import {
  boundaryGeometryQuery,
  boundaryQuery,
  coastQuery,
  courseGeometryQuery,
  courseWayIdsQuery,
  parseBoundaries,
  parseCoast,
  parseBoundaryShape,
  parseOverpass,
  pickBoundary,
  radiusQuery,
  type CourseGeometry,
  type OverpassElement,
} from "@/lib/course/overpass"

// Fetches a course's mapped holes, greens, fairways, bunkers, tees and water
// (plus its boundary, woods, scrub, buildings and roads) from OpenStreetMap via the Overpass API (fixed hosts, numeric-only
// parameters, so nothing user-supplied is ever forwarded as a URL).
// Data (c) OpenStreetMap contributors, ODbL. Overpass asks clients to send
// an identifying User-Agent, and its public servers are shared and
// sometimes busy, so each query races two servers, up to three times, within a 52 s budget.
//
// Courses already in the Supabase cache (course_geometry) are served to
// everyone, signed in or not. A fresh OpenStreetMap fetch -- a cache miss or
// "Refresh course data" -- needs a signed-in golfer and is limited to
// RATE_LIMITS.geometryMiss per golfer per hour, so nobody can hammer the
// public Overpass servers through this route. (No in-memory caches: on
// serverless they only lived as long as one instance; the CDN header below
// and the Supabase cache are the real ones.)
export const maxDuration = 60

const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
const USER_AGENT = "golf-os-capstone/0.1 (shot dispersion research project)"
const BOUNDARY_SEARCH_RADIUS_M = 1000
const FALLBACK_RADIUS_M = 900

async function askHost(host: string, query: string, timeoutMs: number, signal: AbortSignal): Promise<OverpassElement[]> {
  const res = await fetch(host, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, Accept: "*/*", "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`overpass ${res.status}`)
  const json = await res.json() // an HTML "server busy" page throws here
  return (json.elements ?? []) as OverpassElement[]
}

/** Ask both servers at once and take the first good answer; retry if both are busy. */
async function runQuery(query: string, deadline: number): Promise<OverpassElement[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const left = deadline - Date.now()
    if (left < 3000) return null
    const stop = new AbortController()
    try {
      const result = await Promise.any(OVERPASS_HOSTS.map((h) => askHost(h, query, Math.min(20000, left), stop.signal)))
      stop.abort()
      return result
    } catch {
      // both busy or timed out
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  return null
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"))
  const lng = Number(req.nextUrl.searchParams.get("lng"))
  const name = req.nextUrl.searchParams.get("name")?.slice(0, 120) ?? undefined
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 })
  }
  const rawId = req.nextUrl.searchParams.get("id")
  const dbKey = courseKey(rawId)
  // "Refresh course data": skip every cache layer and re-fetch from OpenStreetMap, then
  // overwrite whatever was cached so the NEXT normal load (no force) picks up the refresh.
  const force = req.nextUrl.searchParams.get("force") === "1"
  const CDN = force ? "no-store" : "public, s-maxage=300, stale-while-revalidate=3600"
  // Applied fresh on every request that reaches this route, on top of the cached geometry --
  // never baked into the Supabase copy itself -- so a new correction doesn't wait for that
  // copy to expire (90 days). The CDN header above is short (5 min, plus up to 1 hour of
  // stale serving while it revalidates) because the heavy OpenStreetMap work is already in
  // Supabase: a correction shows up on the next load that misses the CDN, so within about
  // 5 minutes, or sooner after "Refresh course data" (force=1 is never cached).
  const corrections = dbKey ? await readCorrections(dbKey) : []
  const withCorrections = (g: CourseGeometry) => applyCorrections(g, corrections)

  // Cached courses: for everyone, unlimited.
  if (!force && dbKey) {
    const stored = await readCachedGeometry(dbKey)
    if (stored) {
      return NextResponse.json(withCorrections(stored), { headers: { "Cache-Control": CDN, "X-Course-Cache": "supabase" } })
    }
  }

  // A fresh OpenStreetMap fetch: signed-in golfers only, RATE_LIMITS.geometryMiss an hour each.
  const {
    data: { user },
  } = await createClient().auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to load a course that hasn't been loaded before.", signIn: true },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  }
  const limit = await hitRateLimit("geometryMiss", rateLimitBucket("geometryMiss", { userId: user.id }))
  if (!limit.allowed) {
    return rateLimitedResponse(
      limit,
      `You've loaded ${RATE_LIMITS.geometryMiss.max} new courses in the last hour. Courses already loaded still work; try a new one again later.`,
      RATE_LIMITS.geometryMiss.windowSeconds
    )
  }

  // The cache is shared by every user, so what gets stored under a course id must have been fetched
  // at that course's REAL location. With an id, look the location up on the server and ignore the
  // browser's lat/lng/name; if that fails, still answer from the browser's position but never cache it.
  const serverLoc = dbKey && rawId ? await getCourseLocation(rawId) : null
  const useLat = serverLoc ? serverLoc.lat : lat
  const useLng = serverLoc ? serverLoc.lng : lng
  const useName = serverLoc ? serverLoc.name ?? name : name
  const qLat = Math.round(useLat * 1e4) / 1e4
  const qLng = Math.round(useLng * 1e4) / 1e4

  const deadline = Date.now() + 52000
  let geometry = null
  // A query that FAILS (server busy) is reported as 502 so the client retries;
  // only a query that succeeds but finds nothing falls through to the wider
  // radius search. Successful queries are cached in memory, so a retry only
  // repeats the ones that failed.
  const busy = () => NextResponse.json({ error: "Map data service is busy, try again in a moment" }, { status: 502 })

  const boundaries = await runQuery(boundaryQuery(qLat, qLng, BOUNDARY_SEARCH_RADIUS_M), deadline)
  if (!boundaries) return busy()
  const chosen = pickBoundary(parseBoundaries(boundaries), qLat, qLng, useName)
  if (chosen) {
    const idEls = await runQuery(courseWayIdsQuery(chosen), deadline)
    if (!idEls) return busy()
    const ids = idEls.filter((e) => e.type === "way").map((e) => e.id)
    if (ids.length > 0) {
      const els = await runQuery(courseGeometryQuery(ids), deadline)
      if (!els) return busy()
      const g = parseOverpass(els, "course-area")
      if (g.holes.length > 0) {
        // Coastline decides whether the sea counts as water, so it is required
        // (a missing one would silently turn ocean into "rough").
        const coastEls = await runQuery(coastQuery(chosen.bounds), deadline)
        if (!coastEls) return busy()
        g.coast = parseCoast(coastEls)
        // The boundary makes everything outside it out of bounds, so it is
        // required too (a missing one would silently drop that rule).
        const boundaryEls = await runQuery(boundaryGeometryQuery(chosen), deadline)
        if (!boundaryEls) return busy()
        g.boundary = parseBoundaryShape(boundaryEls)
        geometry = g
      }
    }
  }
  if (!geometry) {
    const els = await runQuery(radiusQuery(qLat, qLng, FALLBACK_RADIUS_M), deadline)
    if (!els) return busy()
    geometry = parseOverpass(els, "radius")
  }
  let writeStatus = "not-attempted"
  const decision = decideCacheWrite({
    hasId: dbKey != null,
    server: serverLoc,
    client: { lat, lng },
    holes: geometry.holes.length,
    scope: geometry.scope,
  })
  if (!dbKey) {
    // radius search: never cached
  } else if (decision.write) {
    writeStatus = await writeCachedGeometry(dbKey, { name: useName, lat: qLat, lng: qLng }, geometry)
  } else if (decision.reason !== "not-course-area" && decision.reason !== "implausible-hole-count") {
    // Worth a log line: a lookup failure is an outage, a far-off client position is a poisoning attempt.
    console.warn(`course geometry not cached for ${dbKey}: ${decision.reason}`)
  }
  return NextResponse.json(withCorrections(geometry), {
    headers: { "Cache-Control": CDN, "X-Course-Cache": writeStatus === "stored" ? "miss-stored" : "miss",
      "X-Course-Cache-Write": writeStatus.replace(/[^ -~]/g, " ") },
  })
}
