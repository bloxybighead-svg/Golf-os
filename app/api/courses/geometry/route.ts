import { NextRequest, NextResponse } from "next/server"
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
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } })
  }

  const deadline = Date.now() + 52000
  let geometry = null
  let complete = true // false if an optional query (coastline) failed, so we don't cache a partial result
  const boundaries = await runQuery(boundaryQuery(qLat, qLng, BOUNDARY_SEARCH_RADIUS_M), deadline)
  const chosen = boundaries ? pickBoundary(parseBoundaries(boundaries), qLat, qLng, name) : null
  if (chosen) {
    const idEls = await runQuery(courseWayIdsQuery(chosen), deadline)
    const ids = (idEls ?? []).filter((e) => e.type === "way").map((e) => e.id)
    if (ids.length > 0) {
      const els = await runQuery(courseGeometryQuery(ids), deadline)
      if (els) {
        const g = parseOverpass(els, "course-area")
        if (g.holes.length > 0) {
          geometry = g
          // Coastline is best-effort: a failure just means no ocean hazard.
          const coastEls = await runQuery(coastQuery(chosen.bounds), deadline)
          if (coastEls) geometry.coast = parseCoast(coastEls)
          else complete = false
        }
      }
    }
  }
  if (!geometry) {
    const els = await runQuery(radiusQuery(qLat, qLng, FALLBACK_RADIUS_M), deadline)
    if (!els) {
      return NextResponse.json({ error: "Map data service is busy, try again in a moment" }, { status: 502 })
    }
    geometry = parseOverpass(els, "radius")
  }
  if (geometry.scope === "course-area" && complete) cache.set(key, { at: Date.now(), body: geometry })
  return NextResponse.json(geometry, {
    headers: { "Cache-Control": complete ? "public, s-maxage=86400, stale-while-revalidate=604800" : "no-store" },
  })
}
