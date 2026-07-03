import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import type { Round } from "@/lib/supabase/types"
import { ArrowDownRight, ArrowUpRight, ClipboardList, Flag } from "lucide-react"

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

  const [{ data: roundsData, error }, { data: sessionsData }] = await Promise.all([
    supabase.from("rounds").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("practice_sessions").select("date"),
  ])

  if (error) {
    return (
      <div className="rounded-xl border border-yellow-800/60 bg-yellow-950/30 px-5 py-4 text-sm text-yellow-400">
        <p className="font-semibold">Supabase not connected</p>
        <p className="mt-1 text-xs text-yellow-600">Run the schema SQL and check your .env.local keys.</p>
      </div>
    )
  }

  const rounds = (roundsData ?? []) as Round[]
  const sessions = sessionsData ?? []

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
          <h2 className="text-2xl font-bold tracking-tight text-white">Home</h2>
          <p className="mt-1 text-sm text-[#6b7280]">Where your game stands right now</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/log/new"
            className="flex items-center gap-2 rounded-lg bg-[#22c55e] px-5 py-2.5 text-sm font-semibold text-black shadow-md shadow-[#22c55e]/20 transition-all hover:brightness-110 hover:scale-[1.03] active:scale-[0.97]"
          >
            <ClipboardList size={15} />
            Log Session
          </Link>
          <Link
            href="/rounds?new=1"
            className="flex items-center gap-2 rounded-lg border border-[#22c55e]/40 bg-[#22c55e]/10 px-5 py-2.5 text-sm font-semibold text-[#22c55e] transition-all hover:bg-[#22c55e]/20 hover:scale-[1.03] active:scale-[0.97]"
          >
            <Flag size={15} />
            Log Round
          </Link>
        </div>
      </div>

      {/* The three dashboard elements */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

        {/* Last round differential */}
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Last Round Differential</p>
          {lastDiff != null ? (
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold tracking-tight text-white">{lastDiff.toFixed(1)}</p>
                {diffDelta != null && diffDelta !== 0 && (
                  <span className={[
                    "flex items-center gap-0.5 text-sm font-semibold",
                    diffDelta < 0 ? "text-[#22c55e]" : "text-[#f87171]",
                  ].join(" ")}>
                    {diffDelta < 0 ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                    {Math.abs(diffDelta).toFixed(1)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[#6b7280]">
                {lastRound!.course_name}
                {diffDelta != null
                  ? ` · ${diffDelta < 0 ? "better" : diffDelta > 0 ? "worse" : "same"} vs previous round`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-[#4b5563]">—</p>
              <p className="mt-1 text-xs text-[#4b5563]">
                {lastRound ? "last round has no rating/slope" : "no rounds logged yet"}
              </p>
            </>
          )}
        </div>

        {/* Practice sessions this week */}
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Practice This Week</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tight text-white">{sessionsThisWeek}</p>
            <span className="text-sm text-[#6b7280]">
              session{sessionsThisWeek !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6b7280]">
            vs {sessionsLastWeek} last week
            {sessionsThisWeek > sessionsLastWeek ? " · ahead of pace" : ""}
          </p>
        </div>

        {/* Insight */}
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Insight</p>
          <p className={[
            "text-sm font-medium leading-relaxed",
            rounds.length >= 10 ? "text-white" : "text-[#6b7280]",
          ].join(" ")}>
            {insight}
          </p>
          {rounds.length >= 10 && (
            <p className="mt-1 text-xs text-[#4b5563]">last 10 rounds vs the 10 before</p>
          )}
        </div>
      </div>
    </div>
  )
}
