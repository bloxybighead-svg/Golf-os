"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { cleanCarries, cleanHandicap, type CourseRef } from "@/lib/golfer/baseline"
import { settingsToRow, type PlannerSettings } from "@/lib/golfer/bagSync"

export async function saveBaseline(input: { handicapIndex: unknown; carries: Record<string, unknown>; homeCourse: CourseRef | null }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to save your baseline.")

  const handicapIndex = cleanHandicap(input.handicapIndex)
  const carries = cleanCarries(input.carries)
  const homeCourse = input.homeCourse && typeof input.homeCourse.id === "string" ? input.homeCourse : null

  const { error } = await supabase.from("golfer_baseline").upsert({
    user_id: user.id,
    handicap_index: handicapIndex,
    carries,
    home_course: homeCourse,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)

  // The handicap they gave becomes their current index (a manual entry), unless
  // it already is -- so You shows it straight away, before any rounds exist.
  if (handicapIndex != null) {
    const { data: latest } = await supabase
      .from("handicap_tracking")
      .select("handicap_index")
      .order("calculation_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest || Number(latest.handicap_index) !== handicapIndex) {
      await supabase.from("handicap_tracking").insert({
        user_id: user.id,
        handicap_index: handicapIndex,
        source: "manual",
        notes: "From setup",
      })
    }
  }

  revalidatePath("/")
  revalidatePath("/you")
}

/**
 * Saves the planner's bag and settings to the golfer's existing baseline row
 * (debounced from the Play screen). Update-only: creating the row is what
 * setup (/welcome) does, and a row made here would skip it. Returns the row's
 * new updated_at so the device can stamp its copy with the same time.
 */
export async function saveGolferSettings(input: PlannerSettings): Promise<{ updatedAt: string } | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const row = settingsToRow(input)
  const updatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from("golfer_baseline")
    .update({ ...row, updated_at: updatedAt })
    .eq("user_id", user.id)
    .select("user_id")
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return null // no baseline row yet
  return { updatedAt }
}
