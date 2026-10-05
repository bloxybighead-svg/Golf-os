// The two free elevation services. USGS EPQS (3DEP, about 1 m lidar-derived, US only)
// is the first choice: a 90 m grid smooths away the ridges and swales that matter on
// a hole. Open-Meteo (Copernicus 90 m, worldwide, 100 points per request) covers
// everywhere else. Server only (called from app/api/elevation).

export type ElevationSource = "usgs" | "open-meteo"

export const FEET_PER_METER = 3.280839895

/** EPQS is asked this many points at a time. ESTIMATE: polite to a free public service. */
const EPQS_CONCURRENCY = 8
const REQUEST_TIMEOUT_MS = 8000

export interface LatLngPoint {
  lat: number
  lng: number
}

/** Height in feet from an EPQS response, or null when outside its coverage (it answers a huge negative number). */
export function parseEpqs(json: unknown): number | null {
  const v = (json as { value?: unknown } | null)?.value
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) && n > -1000 ? n : null
}

export function parseOpenMeteo(json: unknown): number[] | null {
  const e = (json as { elevation?: unknown } | null)?.elevation
  if (!Array.isArray(e) || e.some((x) => typeof x !== "number" || !Number.isFinite(x))) return null
  return (e as number[]).map((m) => m * FEET_PER_METER)
}

async function epqsOne(p: LatLngPoint): Promise<number | null> {
  try {
    const url = `https://epqs.nationalmap.gov/v1/json?x=${p.lng.toFixed(6)}&y=${p.lat.toFixed(6)}&wkid=4326&units=Feet&includeDate=false`
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" })
    return res.ok ? parseEpqs(await res.json()) : null
  } catch {
    return null
  }
}

export async function fetchUsgs(points: LatLngPoint[]): Promise<number[] | null> {
  const out: (number | null)[] = new Array(points.length).fill(null)
  let next = 0
  async function worker() {
    while (next < points.length) {
      const i = next++
      out[i] = await epqsOne(points[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(EPQS_CONCURRENCY, points.length) }, worker))
  // All or nothing: a hole half in coverage (or with a failed point) is better answered by one consistent source.
  return out.every((v) => v != null) ? (out as number[]) : null
}

export async function fetchOpenMeteo(points: LatLngPoint[]): Promise<number[] | null> {
  try {
    const q = new URLSearchParams({
      latitude: points.map((p) => p.lat.toFixed(5)).join(","),
      longitude: points.map((p) => p.lng.toFixed(5)).join(","),
    })
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?${q.toString()}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" })
    if (!res.ok) return null
    const ft = parseOpenMeteo(await res.json())
    return ft && ft.length === points.length ? ft : null
  } catch {
    return null
  }
}

/** USGS first, Open-Meteo if USGS cannot cover every point. Null when both fail. */
export async function lookupElevations(points: LatLngPoint[]): Promise<{ elevationsFt: number[]; source: ElevationSource } | null> {
  const usgs = await fetchUsgs(points)
  if (usgs) return { elevationsFt: usgs, source: "usgs" }
  const om = await fetchOpenMeteo(points)
  return om ? { elevationsFt: om, source: "open-meteo" } : null
}
