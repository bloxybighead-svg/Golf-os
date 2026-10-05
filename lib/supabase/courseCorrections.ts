import { createClient } from "@supabase/supabase-js"
import { CONSENSUS_MIN_USERS, pickConsensus, type ConsensusGroup, type CorrectionRow } from "@/lib/course/corrections"

// The corrections that apply to EVERYONE: values that at least CONSENSUS_MIN_USERS distinct
// golfers submitted for the same (course, hole, field). The grouping happens in the database
// (course_corrections_consensus, security definer) because the table itself is owner-only and
// the anon key can't read other golfers' rows. A golfer's own, not-yet-confirmed corrections
// are fetched by their browser instead, so this public, CDN-cached result has no per-user data.

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
    const { data, error } = await db.rpc("course_corrections_consensus", {
      p_course_key: courseKey,
      p_min_users: CONSENSUS_MIN_USERS,
    })
    if (error || !data) return []
    return pickConsensus(data as ConsensusGroup[])
  } catch {
    return []
  }
}
