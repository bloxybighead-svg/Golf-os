import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { loadCategoryTrends } from "@/lib/supabase/loadCategoryTrends"
import { AccountCard } from "@/components/auth/AccountCard"
import { HandicapCard } from "@/components/home/HandicapCard"
import { TrendsCard } from "@/components/home/TrendsCard"
import { TrendsPanel } from "@/components/you/TrendsPanel"
import { RecommendedDrills } from "@/components/you/RecommendedDrills"
import { DrillHistory } from "@/components/you/DrillHistory"
import { AppearanceSetting } from "@/components/you/AppearanceSetting"
import type { HandicapEntry, LibraryDrill, Milestone, Round, UserDrillRun } from "@/lib/supabase/types"
import { weakestCategory, recommendDrills } from "@/lib/drillRecommendations"
import { estimateHandicapIndex } from "@/lib/handicap"
import { ChevronRight } from "lucide-react"

// The bag tools that used to be Course Planner sub-tabs, one row each.
const BAG_TOOLS: { view: string; label: string; blurb: string }[] = [
  { view: "dispersion", label: "Your misses", blurb: "Where each club's shots land" },
  { view: "compare", label: "Compare", blurb: "Your shots next to another golfer's" },
  { view: "custom", label: "What if", blurb: "A golfer built from a handicap" },
  { view: "tbox", label: "Which tees", blurb: "Tees that fit your game" },
]

export default async function YouPage() {
  const supabase = createClient()

  const [
    { data: { user } },
    { data: handicapData },
    { data: roundsData },
    { data: milestonesData },
    { data: libraryData },
    { data: drillRunsData },
    categoryTrends,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("handicap_tracking").select("*").order("calculation_date", { ascending: true }),
    supabase.from("rounds").select("*").order("date", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("milestones").select("*").order("date", { ascending: true }),
    supabase.from("drill_library").select("*"),
    supabase
      .from("user_drills")
      .select("id, drill_id, started_at, completed_at, reps_completed, notes, drill_library(name, category)")
      .order("started_at", { ascending: false })
      .limit(50),
    loadCategoryTrends(supabase),
  ])

  const handicapEntries = (handicapData ?? []) as HandicapEntry[] // oldest first
  const latestHandicap = handicapEntries[handicapEntries.length - 1] ?? null
  const rounds = (roundsData ?? []) as Round[] // oldest first

  // Live estimate over the most recent 20 rounds, shown until the golfer has
  // actually recalculated and gotten a persisted handicap_tracking row. Mirrors
  // the window the Recalculate server action itself queries.
  const liveEstimate = estimateHandicapIndex(
    [...rounds].reverse().slice(0, 20).map((r) => r.differential).filter((d): d is number => d != null)
  )

  // Drill recommendations target the weakest category on the Strengths & Weaknesses card.
  const drillRuns = (drillRunsData ?? []) as unknown as UserDrillRun[]
  const focusArea = weakestCategory(categoryTrends)
  const recommended = focusArea
    ? recommendDrills((libraryData ?? []) as LibraryDrill[], focusArea.category, drillRuns)
    : []

  return (
    <div className="space-y-6 pt-4">
      <h2 className="text-2xl font-bold tracking-tight text-fg">You</h2>

      <AccountCard email={user?.email ?? null} />

      {/* Side by side on wide screens so desktop isn't a stretched phone column */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-4">
        <HandicapCard latest={latestHandicap} liveEstimate={liveEstimate} signedIn={!!user} />
        <TrendsCard trends={categoryTrends} />
      </div>

      <TrendsPanel
        rounds={rounds}
        handicapEntries={handicapEntries}
        milestones={(milestonesData ?? []) as Milestone[]}
      />

      <RecommendedDrills
        focus={focusArea}
        handicapIndex={latestHandicap?.handicap_index ?? null}
        drills={recommended}
        signedIn={!!user}
      />

      <DrillHistory runs={drillRuns} />

      <Link
        href="/log/new"
        className="group flex items-center justify-between rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 transition-colors hover:bg-fg/[0.03]"
      >
        <span className="text-sm font-medium text-fg">Log a practice session</span>
        <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>

      <div className="rounded-xl border border-fg/[0.06] bg-surface">
        <p className="label-xs px-5 pt-4">My bag</p>
        <ul className="mt-2 divide-y divide-fg/[0.04]">
          {BAG_TOOLS.map(({ view, label, blurb }) => (
            <li key={view}>
              <Link
                href={`/you/bag?view=${view}`}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-fg/[0.03]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{label}</span>
                  <span className="block text-xs text-muted">{blurb}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <AppearanceSetting />
    </div>
  )
}
