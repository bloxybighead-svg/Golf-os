import { createClient } from "@/lib/supabase/server"
import { loadCategoryTrends } from "@/lib/supabase/loadCategoryTrends"
import { HandicapCard } from "@/components/home/HandicapCard"
import { TrendsCard } from "@/components/home/TrendsCard"
import { TrendsPanel } from "@/components/you/TrendsPanel"
import { SubPageHeader } from "@/components/you/SubPageHeader"
import type { HandicapEntry, Milestone, Round } from "@/lib/supabase/types"
import { estimateHandicapIndex } from "@/lib/handicap"

export default async function StatsPage() {
  const supabase = createClient()

  const [
    { data: { user } },
    { data: handicapData },
    { data: roundsData },
    { data: milestonesData },
    categoryTrends,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("handicap_tracking").select("*").order("calculation_date", { ascending: true }),
    supabase.from("rounds").select("*").order("date", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("milestones").select("*").order("date", { ascending: true }),
    loadCategoryTrends(supabase),
  ])

  const handicapEntries = (handicapData ?? []) as HandicapEntry[] // oldest first
  const latestHandicap = handicapEntries[handicapEntries.length - 1] ?? null
  const rounds = (roundsData ?? []) as Round[] // oldest first

  // Live WHS index from the saved differentials (most recent 20), shown until a
  // round save has recorded one in handicap_tracking.
  const liveEstimate = estimateHandicapIndex(
    [...rounds].reverse().slice(0, 20).map((r) => r.differential).filter((d): d is number => d != null)
  )

  return (
    <div className="space-y-6 pt-4">
      <SubPageHeader title="Stats" />

      {/* Side by side on wide screens so desktop isn't a stretched phone column */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-4">
        <HandicapCard latest={latestHandicap} liveEstimate={liveEstimate} signedIn={!!user} />
        <TrendsCard trends={categoryTrends} />
      </div>

      <TrendsPanel rounds={rounds} milestones={(milestonesData ?? []) as Milestone[]} />
    </div>
  )
}
