"use server"

import { revalidatePath } from "next/cache"
import { syncCalculatedHandicap } from "@/lib/supabase/syncHandicap"
import { createClient } from "@/lib/supabase/server"
import { calcDifferential } from "@/lib/handicap"
import { computeUserSg, handicapBracketRange } from "@/lib/sgBenchmarks"
import { cleanHoles, summarizeHoles, type HoleEntry, type ScoredHole } from "@/lib/rounds/holes"
import type { Round } from "@/lib/supabase/types"

type Supabase = ReturnType<typeof createClient>

// What the round form sends. With `holes`, everything countable (score, par,
// holes played, fairways/GIR/miss %, putts, up-and-downs, penalties) is
// computed here from the hole-by-hole taps; without, it's a score-only round
// (e.g. a past round added for the handicap) and those stats stay empty.
export interface RoundInput {
  date: string
  course_name: string
  is_competitive: boolean
  breakdown_tags: string[]
  course_rating: number | null
  slope_rating: number | null
  notes: string | null
  holes: HoleEntry[] | null
  score?: number
  par?: number
  holes_played?: number
}

const STAT_COLUMNS = [
  "fairways_pct", "miss_left_pct", "miss_right_pct", "gir_pct",
  "total_putts", "three_putts", "up_and_downs", "penalties",
] as const
type StatColumn = (typeof STAT_COLUMNS)[number]
type RoundCounts = { score: number; par: number; holes_played: number } & Partial<Record<StatColumn, number | null>>
type RoundRow = Omit<RoundInput, "holes" | "score" | "par" | "holes_played"> & RoundCounts & {
  differential: number | null
}

/**
 * The rounds row for this input plus its validated holes (null for score
 * only). The differential is recomputed server-side rather than trusted from
 * the client, so a stale or tampered one never makes it into a saved round.
 */
function buildRound(input: RoundInput): { row: RoundRow; holes: ScoredHole[] | null } {
  const base = {
    date: input.date,
    course_name: (input.course_name ?? "").trim(),
    is_competitive: input.is_competitive,
    breakdown_tags: input.is_competitive ? input.breakdown_tags : [],
    course_rating: input.course_rating,
    slope_rating: input.slope_rating,
    notes: input.notes,
  }
  if (!base.date || !base.course_name) throw new Error("Date and course are required.")

  let holes: ScoredHole[] | null = null
  let counts: RoundCounts
  if (input.holes) {
    holes = cleanHoles(input.holes)
    const s = summarizeHoles(holes)
    counts = {
      score: s.score, par: s.par, holes_played: s.holes_played,
      fairways_pct: s.fairways_pct, miss_left_pct: s.miss_left_pct, miss_right_pct: s.miss_right_pct,
      gir_pct: s.gir_pct, total_putts: s.total_putts, three_putts: s.three_putts,
      up_and_downs: s.up_and_downs, penalties: s.penalties,
    }
  } else {
    const score = Number(input.score), par = Number(input.par), holesPlayed = Number(input.holes_played)
    if (!Number.isInteger(score) || score < 18 || score > 200) throw new Error("Enter a score.")
    if (!Number.isInteger(par) || par < 27 || par > 80) throw new Error("Enter the course par.")
    if (!Number.isInteger(holesPlayed) || holesPlayed < 1 || holesPlayed > 18) throw new Error("Holes played must be 1 to 18.")
    counts = { score, par, holes_played: holesPlayed }
  }

  const differential = base.course_rating != null && base.slope_rating != null
    ? calcDifferential(counts.score, base.course_rating, base.slope_rating)
    : null
  return { row: { ...base, ...counts, differential }, holes }
}

/** Replaces a round's holes (none for score only). */
async function saveHoles(supabase: Supabase, roundId: string, userId: string, holes: ScoredHole[] | null) {
  const { error: delError } = await supabase.from("round_holes").delete().eq("round_id", roundId)
  if (delError) throw new Error(delError.message)
  if (!holes) return
  const { error } = await supabase
    .from("round_holes")
    .insert(holes.map((h) => ({ ...h, round_id: roundId, user_id: userId })))
  if (error) throw new Error(error.message)
}

// Delete-then-reinsert (never updated in place) so an edited round's SG
// analysis is always recomputed fresh from its current stats rather than
// reconciled field-by-field -- cheap, since it's at most 4 rows.
async function saveRoundAnalysis(
  supabase: Supabase,
  roundId: string,
  userId: string,
  data: Pick<Round, "holes_played" | "fairways_pct" | "gir_pct" | "total_putts" | "up_and_downs">,
  handicapIndex: number | null
) {
  await supabase.from("round_analysis").delete().eq("round_id", roundId)
  if (handicapIndex == null) return

  const userSg = computeUserSg({
    holesPlayed: data.holes_played,
    fairwaysPct: data.fairways_pct,
    girPct: data.gir_pct,
    totalPutts: data.total_putts,
    upAndDowns: data.up_and_downs,
  })
  if (userSg.length === 0) return

  const bracket = handicapBracketRange(handicapIndex)
  const { data: benchmarks } = await supabase
    .from("sg_benchmarks")
    .select("category, avg_strokes_gained")
    .eq("handicap_low", bracket.low)
    .eq("handicap_high", bracket.high)
  const benchmarkByCategory = new Map((benchmarks ?? []).map((b) => [b.category, b.avg_strokes_gained as number]))

  const rows = userSg
    .filter((u) => benchmarkByCategory.has(u.category))
    .map((u) => {
      const benchmarkSg = benchmarkByCategory.get(u.category)!
      return {
        round_id: roundId,
        user_id: userId,
        category: u.category,
        user_sg: u.userSg,
        benchmark_sg: benchmarkSg,
        delta_sg: Math.round((u.userSg - benchmarkSg) * 100) / 100,
      }
    })
  if (rows.length > 0) await supabase.from("round_analysis").insert(rows)
}

export async function createRound(input: RoundInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to save rounds.")
  const { row, holes } = buildRound(input)

  // Snapshot the golfer's most recently tracked handicap onto the round, so
  // its progression can be plotted later even as the tracked index moves on.
  const { data: latestHandicap } = await supabase
    .from("handicap_tracking")
    .select("handicap_index")
    .order("calculation_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  const handicapIndex = latestHandicap?.handicap_index ?? null

  const { data: inserted, error } = await supabase
    .from("rounds")
    .insert({ ...row, handicap_index: handicapIndex, user_id: user.id })
    .select("*")
    .single()
  if (error) throw new Error(error.message)

  try {
    await saveHoles(supabase, inserted.id, user.id, holes)
  } catch (e) {
    // No half-saved rounds: a round whose holes didn't save isn't kept.
    await supabase.from("rounds").delete().eq("id", inserted.id)
    throw e
  }
  await saveRoundAnalysis(supabase, inserted.id, user.id, inserted as Round, handicapIndex)
  await syncCalculatedHandicap(supabase, user.id)
  revalidatePath("/rounds")
  revalidatePath("/you")
}

export async function updateRound(id: string, input: RoundInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to edit rounds.")
  const { row, holes } = buildRound(input)

  const [{ data: existing }, { count: holeCount }] = await Promise.all([
    supabase.from("rounds").select("handicap_index").eq("id", id).maybeSingle(),
    supabase.from("round_holes").select("id", { count: "exact", head: true }).eq("round_id", id),
  ])
  const hadHoles = (holeCount ?? 0) > 0

  // Score only: a round that had holes loses the stats they gave; an older
  // round whose stats were typed in keeps them.
  const update: RoundRow = { ...row }
  if (!holes && hadHoles) for (const c of STAT_COLUMNS) update[c] = null

  const { data: updated, error } = await supabase.from("rounds").update(update).eq("id", id).select("*").single()
  if (error) throw new Error(error.message)

  if (holes || hadHoles) await saveHoles(supabase, id, user.id, holes)
  await saveRoundAnalysis(supabase, id, user.id, updated as Round, existing?.handicap_index ?? null)
  await syncCalculatedHandicap(supabase, user.id)
  revalidatePath("/rounds")
  revalidatePath("/you")
}

/** A round's holes, for editing (none for score-only and older rounds). */
export async function getRoundHoles(roundId: string): Promise<HoleEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("round_holes")
    .select("hole_number, par, strokes, fairway_hit, fairway_miss_side, green_hit, green_miss_side, putts, penalty")
    .eq("round_id", roundId)
    .order("hole_number")
  if (error) throw new Error(error.message)
  return (data ?? []) as HoleEntry[]
}

export async function deleteRound(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to delete rounds.")
  const { error } = await supabase.from("rounds").delete().eq("id", id)
  if (error) throw new Error(error.message)
  await syncCalculatedHandicap(supabase, user.id)
  revalidatePath("/rounds")
  revalidatePath("/you")
}
