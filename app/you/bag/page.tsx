import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { loadMyProfile } from "@/lib/supabase/loadMyProfile"
import type { CourseRef } from "@/lib/golfer/baseline"
import type { FittedClub } from "@/lib/you/hub"
import { MyBag } from "@/components/you/MyBag"
import { SubPageHeader } from "@/components/you/SubPageHeader"

// Links from before the split: the research tools moved to /you/lab, "Your
// misses" to /you/bag/misses and "My shot data" to /you/bag/shots.
const LAB_VIEWS = ["compare", "custom", "tbox"]

export default async function BagPage(props: { searchParams?: Promise<{ view?: string }> }) {
  const searchParams = await props.searchParams;
  const view = searchParams?.view
  if (view && LAB_VIEWS.includes(view)) redirect(`/you/lab?view=${view}`)
  if (view === "dispersion") redirect("/you/bag/misses")
  if (view === "shots") redirect("/you/bag/shots")

  const supabase = await createClient()
  const [profile, { data: baseline }] = await Promise.all([
    loadMyProfile(supabase),
    supabase.from("golfer_baseline").select("home_course").maybeSingle(),
  ])
  const fitted: FittedClub[] | null = profile
    ? profile.fits.map((f) => ({ club: f.club, meanCarryYds: f.profile.mean_carry, nShots: f.nShots }))
    : null

  return (
    <div className="space-y-5 pt-4">
      <SubPageHeader title="My bag" />
      <MyBag
        fitted={fitted}
        defaultSource={fitted ? "calibrated" : "handicap"}
        serverHomeCourse={(baseline?.home_course ?? null) as CourseRef | null}
      />
    </div>
  )
}
