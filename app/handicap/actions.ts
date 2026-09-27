"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { estimateHandicapIndex } from "@/lib/handicap"

export async function recalculateHandicap() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to calculate your handicap.")

  const { data, error } = await supabase
    .from("rounds")
    .select("differential")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)

  const diffs = (data ?? []).map((r) => r.differential as number | null).filter((d): d is number => d != null)
  const index = estimateHandicapIndex(diffs)
  if (index == null) {
    throw new Error(`Need at least 8 rated rounds in your last 20 to calculate (found ${diffs.length}).`)
  }

  const { error: insertError } = await supabase.from("handicap_tracking").insert({
    user_id: user.id,
    handicap_index: index,
    source: "calculated",
    rounds_used: diffs.length,
  })
  if (insertError) throw new Error(insertError.message)
  revalidatePath("/")
}

export async function saveManualHandicap(index: number, notes: string | null) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to save a handicap.")
  if (!Number.isFinite(index)) throw new Error("Enter a valid handicap index.")

  const { error } = await supabase.from("handicap_tracking").insert({
    user_id: user.id,
    handicap_index: Math.round(index * 10) / 10,
    source: "manual",
    notes: notes?.trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath("/")
}
