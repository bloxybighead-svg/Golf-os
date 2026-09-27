"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { calcDifferential } from "@/lib/handicap"

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

  const { error } = await supabase.from("rounds").insert({
    ...withDifferential(data),
    handicap_index: latestHandicap?.handicap_index ?? null,
    user_id: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath("/rounds")
  revalidatePath("/")
}

export async function updateRound(id: string, data: RoundPayload) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to edit rounds.")
  const { error } = await supabase.from("rounds").update(withDifferential(data)).eq("id", id)
  if (error) throw new Error(error.message)
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
