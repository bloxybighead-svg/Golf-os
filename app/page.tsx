import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { SignedOutNotice } from "@/components/auth/SignedOutNotice"
import { HandicapCard } from "@/components/home/HandicapCard"
import { TrendsCard } from "@/components/home/TrendsCard"
import type { Round, HandicapEntry } from "@/lib/supabase/types"
import { estimateHandicapIndex } from "@/lib/handicap"
import { loadCategoryTrends } from "@/lib/supabase/loadCategoryTrends"
import { ArrowDownRight, ArrowUpRight, ClipboardList, Flag, Map as MapIcon, ArrowRight } from "lucide-react"

function mondayOfWeekISO(offsetWeeks: number) {
  const d = new Date()
  const day = d.getDay() // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().split("T")[0]
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export default async function Home() {
  const supabase = createClient()

  const [
    { data: { user } },
    { data: roundsData, error },
    { data: sessionsData },
    { data: handicapData },
    categoryTrends,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("rounds").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("practice_sessions").select("date"),
    supabase.from("handicap_tracking").select("*").order("calculation_date", { ascending: false }).limit(1),
    loadCategoryTrends(supabase),
  ])

  if (error) {
    return (
      <div className="rounded-xl border border-warn/40 bg-warn/10 px-5 py-4 text-sm text-warn">
        <p className="font-semibold">Supabase not connected</p>
        <p className="mt-1 text-xs text-warn">Run the schema SQL and check your .env.local keys.</p>
      </div>
    )
  }

  const rounds = (roundsData ?? []) as Round[]
  const sessions = sessionsData ?? []
  const latestHandicap = ((handicapData ?? [])[0] ?? null) as HandicapEntry | null

  // 1. Last round differential + arrow vs the round before it
  const lastRound = rounds[0] ?? null
  const prevRound = rounds[1] ?? null
  const lastDiff = lastRound?.differential ?? null
  const prevDiff = prevRound?.differential ?? null
  const diffDelta = lastDiff != null && prevDiff != null ? lastDiff - prevDiff : null

  // 2. Sessions this week vs last week (Monday-start weeks)
  const thisMonday = mondayOfWeekISO(0)
  const lastMonday = mondayOfWeekISO(-1)
  const sessionsThisWeek = sessions.filter((s) => s.date >= thisMonday).length
  const sessionsLastWeek = sessions.filter((s) => s.date >= lastMonday && s.date < thisMonday).length

  // Live estimate over the most recent 20 rounds, shown until the golfer has
  // actually recalculated and gotten a persisted handicap_tracking row. Mirrors
  // the window the "Recalculate Handicap" server action itself queries.
  const liveEstimate = estimateHandicapIndex(
    rounds.slice(0, 20).map((r) => r.differential).filter((d): d is number => d != null)
  )

  // 3. GIR insight: most recent 10 rounds vs the 10 before that (needs ≥10 rounds)
  let insight = "Log more rounds to unlock insights."
  if (rounds.length >= 10) {
    const recentGir = rounds.slice(0, 10).filter((r) => r.gir_pct != null).map((r) => r.gir_pct as number)
    const priorGir = rounds.slice(10, 20).filter((r) => r.gir_pct != null).map((r) => r.gir_pct as number)
    const recentAvg = avg(recentGir)
    const priorAvg = avg(priorGir)
    if (recentAvg != null && priorAvg != null) {
      const delta = Math.round(recentAvg - priorAvg)
      insight =
        delta === 0
          ? "GIR% steady over your last 10 rounds"
          : `GIR% ${delta > 0 ? "up" : "down"} ${Math.abs(delta)}% over your last 10 rounds`
    }
  }

  return (
    <div className="space-y-8 pt-4">

      {/* Header + quick actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-fg">Play</h2>
          <p className="mt-1 text-sm text-muted">Where your game stands right now</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/log/new"
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-md shadow-accent/20 transition-all hover:brightness-110 hover:scale-[1.03] active:scale-[0.97]"
          >
            <ClipboardList size={15} />
            Log Session
          </Link>
          <Link
            href="/rounds?new=1"
            className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-5 py-2.5 text-sm font-semibold text-accent transition-all hover:bg-accent/20 hover:scale-[1.03] active:scale-[0.97]"
          >
            <Flag size={15} />
            Log Round
          </Link>
        </div>
      </div>

      {!user && <SignedOutNotice feature="home stats" />}

      {/* Course Planner promo */}
      <Link
        href="/planner"
        className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-accent/25 bg-accent/[0.06] px-5 py-4 transition-colors hover:border-accent/50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
          <MapIcon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">Plan your next round on the real course</span>
          <span className="block text-xs text-fg-3">
            Load any course, stand on the tee or anywhere in the fairway, and see which club gains the most strokes with your own dispersion.
          </span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-accent transition-transform group-hover:translate-x-1" />
      </Link>

      {/* The three dashboard elements */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

        {/* Last round differential */}
        <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Last Round Differential</p>
          {lastDiff != null ? (
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold tracking-tight text-fg">{lastDiff.toFixed(1)}</p>
                {diffDelta != null && diffDelta !== 0 && (
                  <span className={[
                    "flex items-center gap-0.5 text-sm font-semibold",
                    diffDelta < 0 ? "text-accent" : "text-danger",
                  ].join(" ")}>
                    {diffDelta < 0 ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                    {Math.abs(diffDelta).toFixed(1)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                {lastRound!.course_name}
                {diffDelta != null
                  ? ` · ${diffDelta < 0 ? "better" : diffDelta > 0 ? "worse" : "same"} vs previous round`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-faint">—</p>
              <p className="mt-1 text-xs text-faint">
                {lastRound ? "last round has no rating/slope" : "no rounds logged yet"}
              </p>
            </>
          )}
        </div>

        {/* Practice sessions this week */}
        <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Practice This Week</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tight text-fg">{sessionsThisWeek}</p>
            <span className="text-sm text-muted">
              session{sessionsThisWeek !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            vs {sessionsLastWeek} last week
            {sessionsThisWeek > sessionsLastWeek ? " · ahead of pace" : ""}
          </p>
        </div>

        {/* Insight */}
        <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Insight</p>
          <p className={[
            "text-sm font-medium leading-relaxed",
            rounds.length >= 10 ? "text-fg" : "text-muted",
          ].join(" ")}>
            {insight}
          </p>
          {rounds.length >= 10 && (
            <p className="mt-1 text-xs text-faint">last 10 rounds vs the 10 before</p>
          )}
        </div>
      </div>

      {/* Side by side on wide screens so desktop isn't a stretched phone column */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-4">
        {/* Handicap Index — tracked history + manual/calculated recalculation */}
        <HandicapCard latest={latestHandicap} liveEstimate={liveEstimate} signedIn={!!user} />

        {/* Strengths & weaknesses vs. this golfer's own handicap bracket */}
        <TrendsCard trends={categoryTrends} />
      </div>
    </div>
  )
}
