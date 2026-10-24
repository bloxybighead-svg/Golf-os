"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

/** Logs a finished practice block in one go: a library drill, or free practice when `drillId` is null. */
export async function logPractice(entry: {
  drillId: string | null
  minutes: number
  rating: number
  notes: string | null
  at: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to log practice.")
  if (!Number.isInteger(entry.minutes) || entry.minutes < 1 || entry.minutes > 600) {
    throw new Error("Minutes must be a whole number from 1 to 600.")
  }
  if (!Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5) {
    throw new Error("Rate it from 1 to 5.")
  }
  const { error } = await supabase.from("user_drills").insert({
    user_id: user.id,
    drill_id: entry.drillId,
    started_at: entry.at,
    completed_at: entry.at,
    minutes: entry.minutes,
    rating: entry.rating,
    notes: entry.notes?.trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath("/you/practice")
}
