import { createClient } from "@supabase/supabase-js"
import type { CourseGeometry } from "@/lib/course/overpass"

// Persistent cache of course geometry in Supabase (table course_geometry).
// Reads use the public anon key (the table is public-read). Writes need the
// service-role key, which is optional: without SUPABASE_SERVICE_ROLE_KEY the
// route still works, it just can't fill the cache.

const CACHE_MAX_AGE_MS = 90 * 24 * 3600 * 1000 // OSM course maps change slowly

const KEY_PATTERN = /^ogapi:[0-9a-f-]{8,64}$/i

export function courseKey(openGolfApiId: string | null): string | null {
  const key = openGolfApiId ? `ogapi:${openGolfApiId}` : null
  return key && KEY_PATTERN.test(key) ? key : null
}

function readClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  return createClient(url, anon, { auth: { persistSession: false } })
}

function writeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) return null
  return createClient(url, service, { auth: { persistSession: false } })
}

export async function readCachedGeometry(key: string): Promise<CourseGeometry | null> {
  try {
    const db = readClient()
    if (!db) return null
    const { data, error } = await db.from("course_geometry").select("geometry, fetched_at").eq("course_key", key).maybeSingle()
    if (error || !data) return null
    if (Date.now() - new Date(data.fetched_at).getTime() > CACHE_MAX_AGE_MS) return null
    const g = data.geometry as CourseGeometry
    return g && Array.isArray(g.holes) && g.holes.length > 0 ? { ...g, coast: g.coast ?? [] } : null
  } catch {
    return null
  }
}

/** Returns true if the geometry was stored. Silent no-op without the service key. */
export async function writeCachedGeometry(
  key: string,
  meta: { name?: string; lat: number; lng: number },
  geometry: CourseGeometry
): Promise<boolean> {
  try {
    const db = writeClient()
    if (!db) return false
    const { error } = await db.from("course_geometry").upsert({
      course_key: key,
      name: meta.name ?? null,
      lat: meta.lat,
      lng: meta.lng,
      geometry,
      fetched_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}
