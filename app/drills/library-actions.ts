"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

/** Logs the start of a recommended drill; returns the new run's id so it can be completed later. */
export async function startDrill(drillId: string): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to log drills.")
  const { data, error } = await supabase
    .from("user_drills")
    .insert({ user_id: user.id, drill_id: drillId })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  revalidatePath("/")
  return data.id
}

export async function completeDrill(runId: string, repsCompleted: number | null, notes: string | null) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to log drills.")
  if (repsCompleted != null && (!Number.isInteger(repsCompleted) || repsCompleted < 0)) {
    throw new Error("Reps must be a whole number, 0 or more.")
  }
  const { error } = await supabase
    .from("user_drills")
    .update({ completed_at: new Date().toISOString(), reps_completed: repsCompleted, notes: notes?.trim() || null })
    .eq("id", runId)
  if (error) throw new Error(error.message)
  revalidatePath("/")
}
