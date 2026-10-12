import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { cleanHandicap, type CourseRef } from "@/lib/golfer/baseline"
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
  const [profile, { data: baseline }, { data: tracked }] = await Promise.all([
    loadMyProfile(supabase),
    supabase.from("golfer_baseline").select("home_course, handicap_index").maybeSingle(),
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
  ])
  // The same order Play blends thin clubs toward: tracked index, else the setup one.
  const accountHandicap = tracked ? Number(tracked.handicap_index) : cleanHandicap(baseline?.handicap_index)

  return (
    <div className="space-y-5 pt-4">
      <SubPageHeader title="My bag" />
      <MyBag
        fits={profile?.fits ?? null}
        accountHandicap={accountHandicap}
        serverHomeCourse={(baseline?.home_course ?? null) as CourseRef | null}
      />
    </div>
  )
}
