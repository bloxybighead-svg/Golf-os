import { createClient } from "@supabase/supabase-js"

// Persistent cache of hole elevations in Supabase (table course_elevation).
// Reads use the public anon key (public-read table); writes need the service-role
// key, which is optional: without SUPABASE_SERVICE_ROLE_KEY the route still works,
// it just can't fill the cache. No expiry: the ground does not change.

export interface CachedElevation {
  points: { lat: number; lng: number }[]
  elevationsFt: (number | null)[]
  source: string
}

function readClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return url && anon ? createClient(url, anon, { auth: { persistSession: false } }) : null
}

function writeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && service ? createClient(url, service, { auth: { persistSession: false } }) : null
}

export async function readCachedElevation(courseKey: string, holeId: string): Promise<CachedElevation | null> {
  try {
    const db = readClient()
    if (!db) return null
    const { data, error } = await db.from("course_elevation").select("points, elevations_ft, source").eq("course_key", courseKey).eq("hole_id", holeId).maybeSingle()
    if (error || !data) return null
    return { points: data.points as CachedElevation["points"], elevationsFt: data.elevations_ft as CachedElevation["elevationsFt"], source: data.source as string }
  } catch {
    return null
  }
}

/** "stored" on success, else a short reason. */
export async function writeCachedElevation(courseKey: string, holeId: string, value: CachedElevation): Promise<string> {
  try {
    const db = writeClient()
    if (!db) return "no-service-key"
    const { error } = await db.from("course_elevation").upsert({
      course_key: courseKey,
      hole_id: holeId,
      points: value.points,
      elevations_ft: value.elevationsFt,
      source: value.source,
      fetched_at: new Date().toISOString(),
    })
    return error ? `db-error: ${error.message.slice(0, 80)}` : "stored"
  } catch (e) {
    return `exception: ${e instanceof Error ? e.message.slice(0, 80) : "unknown"}`
  }
}
