import type { createClient } from "@/lib/supabase/server"
import { getBaseline } from "@/lib/course/baseline"
import { fromDbRow, type RoundShotRow } from "@/lib/rounds/shots"
import { strokesGainedForRound, summarizeSg, type SgSummary } from "@/lib/rounds/strokesGained"

/** Real strokes gained looks at this many most recent rounds, and only shows once every one of them has shot data. From the spec. */
const SG_WINDOW_ROUNDS = 5

export interface ShotSgData {
  rounds: number
  scratch: SgSummary
  /** Against the golfer's own handicap; null when it isn't known. */
  mine: { label: string; summary: SgSummary } | null
}

/** Strokes gained from the last SG_WINDOW_ROUNDS rounds' recorded shots, or null when any of them has none (or no hole is complete). */
export async function loadShotSg(supabase: Awaited<ReturnType<typeof createClient>>, handicap: number | null): Promise<ShotSgData | null> {
  const { data: recent } = await supabase
    .from("rounds")
    .select("id")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SG_WINDOW_ROUNDS)
  const ids = (recent ?? []).map((r) => r.id as string)
  if (ids.length < SG_WINDOW_ROUNDS) return null

  const [{ data: shotRows }, { data: holeRows }] = await Promise.all([
    supabase.from("round_shots").select("round_id, hole_number, shot_number, club, from_lat, from_lng, from_lie, to_lat, to_lng, to_lie, penalty_strokes").in("round_id", ids),
    supabase.from("round_holes").select("round_id, hole_number, par, strokes").in("round_id", ids),
  ])
  const shots = (shotRows ?? []) as (RoundShotRow & { round_id: string })[]
  if (!ids.every((id) => shots.some((s) => s.round_id === id))) return null
  const holes = (holeRows ?? []) as { round_id: string; hole_number: number; par: number; strokes: number }[]

  const rounds = ids.map((id) => ({
    holes: holes.filter((h) => h.round_id === id).map((h) => ({ holeNumber: h.hole_number, par: h.par, strokes: h.strokes })),
    shots: shots.filter((s) => s.round_id === id).map(fromDbRow),
  }))
  const summary = (forHandicap: number) => summarizeSg(rounds.map((r) => strokesGainedForRound(r.holes, r.shots, getBaseline(forHandicap))))

  const scratch = summary(0)
  if (scratch.holesCounted === 0) return null
  return {
    rounds: ids.length,
    scratch,
    mine: handicap == null ? null : { label: getBaseline(handicap).label, summary: summary(handicap) },
  }
}
