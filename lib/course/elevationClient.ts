// Gets a hole's ground heights: from this device's saved copy first (elevation
// never changes, and this is what works with no signal), else from
// /api/elevation, which keeps its own copy in Supabase. Saves what it fetched.

import { kvGet, kvSet } from "@/lib/offline/db"
import { buildElevationField, holeSamplePoints, samePoints, type ElevationField, type ElevationPoint } from "./elevation"
import type { LatLng } from "./geo"

interface SavedElevation {
  points: ElevationPoint[]
}

export const elevationKey = (courseId: string, holeId: string) => `elevation:${courseId}:${holeId}`

/** The ground-height field for a hole, or null when it can't be had (no signal and never fetched). */
export async function loadHoleElevation(courseId: string, holeId: string, line: LatLng[], signal?: AbortSignal): Promise<ElevationField | null> {
  const wanted = holeSamplePoints(line)
  if (wanted.length < 3) return null
  const key = elevationKey(courseId, holeId)
  const saved = (await kvGet<SavedElevation>(key))?.value
  if (saved && Array.isArray(saved.points) && samePoints(saved.points, wanted)) return buildElevationField(saved.points)
  try {
    const res = await fetch("/api/elevation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, holeId, points: wanted }),
      signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { elevationsFt?: (number | null)[] }
    const fts = json.elevationsFt
    if (!Array.isArray(fts) || fts.length !== wanted.length) return null
    const points: ElevationPoint[] = []
    wanted.forEach((p, i) => {
      const ft = fts[i]
      if (typeof ft === "number" && Number.isFinite(ft)) points.push({ ...p, ft })
    })
    if (points.length < 3) return null
    // Saved with the full list so it matches `wanted` next time (a failed point is kept out of the field, not the match).
    if (points.length === wanted.length) void kvSet(key, { points } satisfies SavedElevation)
    return buildElevationField(points)
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e
    return null
  }
}
