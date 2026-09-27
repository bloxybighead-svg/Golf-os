"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { calcDifferential } from "@/lib/handicap"
import { computeUserSg, handicapBracketRange } from "@/lib/sgBenchmarks"

interface RoundPayload {
  date: string
  holes_played: number
  course_name: string
  score: number
  par: number
  is_competitive: boolean
  breakdown_tags: string[]
  course_rating: number | null
  slope_rating: number | null
  differential: number | null
  penalties: number | null
  fairways_pct: number | null
  gir_pct: number | null
  total_putts: number | null
  three_putts: number | null
  up_and_downs: number | null
  miss_left_pct: number | null
  miss_right_pct: number | null
  notes: string | null
}

// Recomputed server-side rather than trusted from the client payload, so a
// stale or tampered differential can never make it into a saved round.
function withDifferential(data: RoundPayload): RoundPayload {
  return {
    ...data,
    differential: data.course_rating != null && data.slope_rating != null
      ? calcDifferential(data.score, data.course_rating, data.slope_rating)
      : null,
  }
}

// Delete-then-reinsert (never updated in place) so an edited round's SG
// analysis is always recomputed fresh from its current stats rather than
// reconciled field-by-field -- cheap, since it's at most 4 rows.
async function saveRoundAnalysis(
  supabase: ReturnType<typeof createClient>,
  roundId: string,
  userId: string,
  data: RoundPayload,
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

export async function createRound(data: RoundPayload) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to save rounds.")

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
    .insert({ ...withDifferential(data), handicap_index: handicapIndex, user_id: user.id })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  await saveRoundAnalysis(supabase, inserted.id, user.id, data, handicapIndex)
  revalidatePath("/rounds")
  revalidatePath("/")
}

export async function updateRound(id: string, data: RoundPayload) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to edit rounds.")

  const { data: existing } = await supabase.from("rounds").select("handicap_index").eq("id", id).maybeSingle()

  const { error } = await supabase.from("rounds").update(withDifferential(data)).eq("id", id)
  if (error) throw new Error(error.message)

  await saveRoundAnalysis(supabase, id, user.id, data, existing?.handicap_index ?? null)
  revalidatePath("/rounds")
  revalidatePath("/")
}

export async function deleteRound(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to delete rounds.")
  const { error } = await supabase.from("rounds").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/rounds")
}
