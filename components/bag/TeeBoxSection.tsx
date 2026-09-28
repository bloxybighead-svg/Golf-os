import { createClient } from "@/lib/supabase/server"
import { TBoxClient, type KnownCourse } from "@/components/simulator/TBoxClient"

const GOLFER_NAME = "Dillon Cady"

export async function TeeBoxSection() {
  const supabase = createClient()

  const [{ data: rounds }, { data: driverProfile }] = await Promise.all([
    supabase
      .from("rounds")
      .select("course_name, course_rating, slope_rating, par, date")
      .not("course_rating", "is", null)
      .not("slope_rating", "is", null)
      .order("date", { ascending: false }),
    supabase
      .from("golfer_profiles")
      .select("mean_carry_yds")
      .eq("golfer_name", GOLFER_NAME)
      .eq("source_label", "calibrated")
      .eq("club", "Driver")
      .maybeSingle(),
  ])

  // Dedupe by course name, keeping the most recently played rating/slope/par
  // for that course (rounds is already ordered newest-first).
  const seen = new Set<string>()
  const knownCourses: KnownCourse[] = []
  for (const r of rounds ?? []) {
    if (seen.has(r.course_name)) continue
    seen.add(r.course_name)
    knownCourses.push({
      courseName: r.course_name,
      courseRating: Number(r.course_rating),
      slopeRating: Number(r.slope_rating),
      par: r.par,
    })
  }

  return (
    <TBoxClient
      knownCourses={knownCourses}
      defaultDriverCarryYds={driverProfile ? Number(driverProfile.mean_carry_yds) : undefined}
    />
  )
}
