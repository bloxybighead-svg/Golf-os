import { createClient } from "@/lib/supabase/server"
import { loadSgData } from "@/lib/supabase/loadSgData"
import { loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { SgSection } from "@/components/you/SgSection"
import { HandicapCard } from "@/components/home/HandicapCard"
import { TrendsPanel } from "@/components/you/TrendsPanel"
import { SubPageHeader } from "@/components/you/SubPageHeader"
import type { HandicapEntry, Milestone, Round } from "@/lib/supabase/types"
import { estimateHandicapIndex } from "@/lib/handicap"

/** Strokes gained looks at this many most recent rounds. */
const SG_WINDOW_ROUNDS = 10

export default async function StatsPage() {
  const supabase = await createClient()

  const [
    { data: { user } },
    { data: handicapData },
    { data: roundsData },
    { data: milestonesData },
    sgData,
    profile,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("handicap_tracking").select("*").order("calculation_date", { ascending: true }),
    supabase.from("rounds").select("*").order("date", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("milestones").select("*").order("date", { ascending: true }),
    loadSgData(supabase, SG_WINDOW_ROUNDS),
    loadMyProfile(supabase),
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
        <SgSection data={sgData} fits={profile?.fits ?? null} ownHandicap={latestHandicap?.handicap_index ?? liveEstimate} />
      </div>

      <TrendsPanel rounds={rounds} milestones={(milestonesData ?? []) as Milestone[]} />
    </div>
  )
}
