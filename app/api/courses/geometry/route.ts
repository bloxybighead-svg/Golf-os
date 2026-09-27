import { NextRequest, NextResponse } from "next/server"
import { applyCorrections } from "@/lib/course/corrections"
import { courseKey, readCachedGeometry, writeCachedGeometry } from "@/lib/supabase/courseCache"
import { readCorrections } from "@/lib/supabase/courseCorrections"
import {
  boundaryQuery,
  coastQuery,
  courseGeometryQuery,
  courseWayIdsQuery,
  parseBoundaries,
  parseCoast,
  parseOverpass,
  pickBoundary,
  radiusQuery,
  type CourseGeometry,
  type OverpassElement,
} from "@/lib/course/overpass"

// Fetches a course's mapped holes, greens, fairways, bunkers, tees and water
// from OpenStreetMap via the Overpass API (fixed hosts, numeric-only
// parameters, so nothing user-supplied is ever forwarded as a URL).
// Data (c) OpenStreetMap contributors, ODbL. Overpass asks clients to send
// an identifying User-Agent, and its public servers are shared and
// sometimes busy, so each query races two servers, up to three times, within a 52 s budget.
export const maxDuration = 60

const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
const USER_AGENT = "golf-os-capstone/0.1 (shot dispersion research project)"
const CACHE_TTL_MS = 6 * 3600 * 1000
const queryCache = new Map<string, { at: number; els: OverpassElement[] }>()
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
  // Remember each successful query so that a retry after a partial failure
  // only re-asks the queries that failed.
  const cached = queryCache.get(query)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.els
  const els = await runQueryUncached(query, deadline)
  if (els) queryCache.set(query, { at: Date.now(), els })
  return els
}

async function runQueryUncached(query: string, deadline: number): Promise<OverpassElement[] | null> {
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

// Per-instance memory caches on top of the CDN cache header below: Overpass
// is slow (5-30 s), and repeat loads of the same course shouldn't pay again.
const cache = new Map<string, { at: number; body: unknown }>()

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"))
  const lng = Number(req.nextUrl.searchParams.get("lng"))
  const name = req.nextUrl.searchParams.get("name")?.slice(0, 120) ?? undefined
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 })
  }
  const qLat = Math.round(lat * 1e4) / 1e4
  const qLng = Math.round(lng * 1e4) / 1e4
  const key = `${qLat},${qLng},${name ?? ""}`
  const dbKey = courseKey(req.nextUrl.searchParams.get("id"))
  // "Refresh course data": skip every cache layer and re-fetch from OpenStreetMap, then
  // overwrite whatever was cached so the NEXT normal load (no force) picks up the refresh.
  const force = req.nextUrl.searchParams.get("force") === "1"
  const CDN = force ? "no-store" : "public, s-maxage=86400, stale-while-revalidate=604800"
  // Applied fresh on every request, on top of whatever cache layer served the geometry --
  // never baked into the cached copy itself -- so a new correction takes effect on the very
  // next load instead of waiting for that cache to expire (90 days for Supabase, 6h in-memory).
  const corrections = dbKey ? await readCorrections(dbKey) : []
  const withCorrections = (g: CourseGeometry) => applyCorrections(g, corrections)

  // 1) in-memory (this server instance), 2) Supabase (shared, survives deploys)
  if (!force) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json(withCorrections(hit.body as CourseGeometry), { headers: { "Cache-Control": CDN, "X-Course-Cache": "memory" } })
    }
    if (dbKey) {
      const stored = await readCachedGeometry(dbKey)
      if (stored) {
        cache.set(key, { at: Date.now(), body: stored })
        return NextResponse.json(withCorrections(stored), { headers: { "Cache-Control": CDN, "X-Course-Cache": "supabase" } })
      }
    }
  }

  const deadline = Date.now() + 52000
  let geometry = null
  // A query that FAILS (server busy) is reported as 502 so the client retries;
  // only a query that succeeds but finds nothing falls through to the wider
  // radius search. Successful queries are cached in memory, so a retry only
  // repeats the ones that failed.
  const busy = () => NextResponse.json({ error: "Map data service is busy, try again in a moment" }, { status: 502 })

  const boundaries = await runQuery(boundaryQuery(qLat, qLng, BOUNDARY_SEARCH_RADIUS_M), deadline)
  if (!boundaries) return busy()
  const chosen = pickBoundary(parseBoundaries(boundaries), qLat, qLng, name)
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
  if (geometry.scope === "course-area") {
    cache.set(key, { at: Date.now(), body: geometry })
    // Only persist plausible single courses (9 or 18 holes): a boundary that
    // swallows several courses would otherwise be saved and served as wrong data.
    const plausible = geometry.holes.length === 9 || geometry.holes.length === 18
    if (dbKey && plausible) writeStatus = await writeCachedGeometry(dbKey, { name, lat: qLat, lng: qLng }, geometry)
  }
  return NextResponse.json(withCorrections(geometry), {
    headers: { "Cache-Control": CDN, "X-Course-Cache": writeStatus === "stored" ? "miss-stored" : "miss",
      "X-Course-Cache-Write": writeStatus.replace(/[^ -~]/g, " ") },
  })
}
