"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { cleanCarries, cleanHandicap, type CourseRef } from "@/lib/golfer/baseline"

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
