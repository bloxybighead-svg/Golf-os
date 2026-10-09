import { createClient } from "@/lib/supabase/server"
import { needsNewCalculatedEntry, recalculateRounds, type HoleScore, type RoundForHandicap } from "@/lib/handicap"

type Supabase = Awaited<ReturnType<typeof createClient>>

const PAGE = 1000 // Supabase returns at most 1,000 rows per request

/**
 * Re-scores the golfer's whole record under WHS (lib/handicap.ts
 * recalculateRounds): adjusted gross scores (net double bogey / par + 5),
 * 9- and 10-17-hole differentials completed with the index of the day, then
 * the Handicap Index. Updates only rounds whose numbers changed, and records
 * the index when it changed. Runs after every round save, edit or delete --
 * an edited old round can change the caps of every round after it -- and
 * from "Recalculate all rounds". Returns what it did; throws only when asked
 * to (`strict`), so a failure here never fails the save that triggered it.
 */
export async function syncCalculatedHandicap(
  supabase: Supabase,
  userId: string,
  { strict = false }: { strict?: boolean } = {}
): Promise<{ changed: number; index: number | null; rounds: number }> {
  try {
    const { data: rounds, error } = await supabase
      .from("rounds")
      .select("id, date, created_at, score, holes_played, course_rating, slope_rating, differential, adjusted_score, differential_status, score_cap")
    if (error) throw new Error(error.message)

    const holesByRound = new Map<string, HoleScore[]>()
    for (let from = 0; ; from += PAGE) {
      const { data: holes, error: holesError } = await supabase
        .from("round_holes")
        .select("round_id, hole_number, par, strokes, stroke_index")
        .order("round_id")
        .order("hole_number")
        .range(from, from + PAGE - 1)
      if (holesError) throw new Error(holesError.message)
      for (const h of holes ?? []) {
        const list = holesByRound.get(h.round_id) ?? []
        list.push({ par: h.par, strokes: h.strokes, strokeIndex: h.stroke_index ?? null })
        holesByRound.set(h.round_id, list)
      }
      if ((holes ?? []).length < PAGE) break
    }

    const { data: entries } = await supabase
      .from("handicap_tracking")
      .select("*")
      .order("calculation_date", { ascending: true })
    const manual = (entries ?? [])
      .filter((e) => e.source === "manual")
      .map((e) => ({ date: String(e.calculation_date).slice(0, 10), index: Number(e.handicap_index) }))

    const record: RoundForHandicap[] = (rounds ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      createdAt: r.created_at,
      score: r.score,
      holesPlayed: r.holes_played,
      courseRating: r.course_rating == null ? null : Number(r.course_rating),
      slopeRating: r.slope_rating == null ? null : Number(r.slope_rating),
      holes: holesByRound.get(r.id) ?? null,
    }))
    const { results, index, differentialsUsed, adjustments } = recalculateRounds(record, manual)

    const byId = new Map((rounds ?? []).map((r) => [r.id, r]))
    const changes = results.filter((res) => {
      const r = byId.get(res.id)
      return (
        !r ||
        (r.differential == null ? null : Number(r.differential)) !== res.differential ||
        r.adjusted_score !== res.adjustedScore ||
        r.differential_status !== res.status ||
        r.score_cap !== res.scoreCap
      )
    })
    for (const res of changes) {
      const { error: upError } = await supabase
        .from("rounds")
        .update({
          differential: res.differential,
          adjusted_score: res.adjustedScore,
          differential_status: res.status,
          score_cap: res.scoreCap,
        })
        .eq("id", res.id)
      if (upError) throw new Error(upError.message)
    }

    const latest = entries && entries.length > 0 ? entries[entries.length - 1] : null
    const flags = { esr: adjustments.esr, cap: adjustments.cap }
    if (needsNewCalculatedEntry(latest ?? null, index, flags)) {
      const row = { user_id: userId, handicap_index: index, source: "calculated", rounds_used: differentialsUsed }
      // esr_adjustment / cap_applied come from supabase/handicap_caps.sql; before it has run, record the index without them.
      let { error: insError } = await supabase
        .from("handicap_tracking")
        .insert({ ...row, esr_adjustment: flags.esr, cap_applied: flags.cap === "none" ? null : flags.cap })
      if (insError) ({ error: insError } = await supabase.from("handicap_tracking").insert(row))
      if (insError) throw new Error(insError.message)
    }
    return { changed: changes.length, index, rounds: results.length }
  } catch (e) {
    if (strict) throw e
    // Leave things as they were; the next round save retries.
    return { changed: 0, index: null, rounds: 0 }
  }
}
