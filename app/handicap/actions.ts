"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

// The calculated index updates itself whenever a round is saved
// (lib/supabase/syncHandicap.ts); this is the manual override, e.g. an official GHIN number.
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
  revalidatePath("/you")
}
