import { createClient } from "@supabase/supabase-js"
import type { CorrectionRow } from "@/lib/course/corrections"

// Reads golfer-submitted course corrections (public-read table, anon key is enough --
// unlike course_geometry there's no write path here that needs the service-role key,
// since a signed-in golfer submits their own correction directly from the browser).

function readClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  return createClient(url, anon, { auth: { persistSession: false } })
}

export async function readCorrections(courseKey: string): Promise<CorrectionRow[]> {
  try {
    const db = readClient()
    if (!db) return []
    const { data, error } = await db
      .from("course_corrections")
      .select("hole_id, field_name, corrected_value")
      .eq("course_key", courseKey)
    if (error || !data) return []
    return data as CorrectionRow[]
  } catch {
    return []
  }
}
