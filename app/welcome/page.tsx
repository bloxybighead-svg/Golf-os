import { createClient } from "@/lib/supabase/server"
import { WelcomeClient } from "@/components/welcome/WelcomeClient"
import { cleanCarries, type Baseline, type CourseRef } from "@/lib/golfer/baseline"
import { safeReturnPath } from "@/lib/you/hub"

// Setup: handicap, carries and home course, then an offer to add past rounds.
// Works signed out (saved on this device) and signed in (also saved to the account).
// ?edit=1 reopens it as "Edit your bag" (prefilled; saving returns to ?return=, default My bag).
export default async function WelcomePage({ searchParams }: { searchParams?: { edit?: string; return?: string } }) {
  const editing = searchParams?.edit === "1"
  const returnTo = safeReturnPath(searchParams?.return)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // An account's saved baseline prefills the form. Without one, the form
  // prefills from this device's setup instead, plus the tracked handicap.
  let initial: Baseline | null = null
  let trackedHandicap: number | null = null
  if (user) {
    const [{ data: baseline }, { data: latest }] = await Promise.all([
      supabase.from("golfer_baseline").select("handicap_index, carries, home_course").maybeSingle(),
      supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
    ])
    trackedHandicap = latest ? Number(latest.handicap_index) : null
    if (baseline) {
      initial = {
        handicapIndex: baseline.handicap_index != null ? Number(baseline.handicap_index) : trackedHandicap,
        carries: cleanCarries((baseline.carries ?? {}) as Record<string, unknown>),
        homeCourse: (baseline.home_course ?? null) as CourseRef | null,
      }
    }
  }

  return (
    <WelcomeClient initial={initial} trackedHandicap={trackedHandicap} signedIn={!!user} editReturnTo={editing ? returnTo : null} />
  )
}
