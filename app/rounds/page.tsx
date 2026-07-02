import { createClient } from "@/lib/supabase/server"
import { RoundsClient } from "@/components/rounds/RoundsClient"
import type { Round } from "@/lib/supabase/types"

function startOfMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function avg(nums: number[]) {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export default async function RoundsPage() {
  const supabase = createClient()

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return (
      <div className="rounded-xl border border-yellow-800/60 bg-yellow-950/30 px-5 py-4 text-sm text-yellow-400">
        <p className="font-semibold">Supabase not connected</p>
        <p className="mt-1 text-xs text-yellow-600">
          Run supabase/rounds_schema.sql and check your .env.local keys.
        </p>
      </div>
    )
  }

  const rounds = (data ?? []) as Round[]

  const monthStart = startOfMonthISO()
  const roundsThisMonth = rounds.filter((r) => r.date >= monthStart).length

  const scores = rounds.map((r) => r.score - r.par)
  const avgScoreRel = avg(scores)

  const diffs = rounds.filter((r) => r.differential != null).map((r) => r.differential as number)
  const avgDiff = avg(diffs)

  const compDiffs = rounds.filter((r) => r.is_competitive && r.differential != null).map((r) => r.differential as number)
  const avgCompDiff = avg(compDiffs)

  const pracDiffs = rounds.filter((r) => !r.is_competitive && r.differential != null).map((r) => r.differential as number)
  const avgPracDiff = avg(pracDiffs)

  const penPerHole = rounds
    .filter((r) => r.penalties != null)
    .map((r) => (r.penalties as number) / (r.holes_played || 18))
  const avgPenPerHole = avg(penPerHole)

  const fwPcts = rounds.filter((r) => r.fairways_pct != null).map((r) => r.fairways_pct as number)
  const avgFairways = avg(fwPcts)

  const girPcts = rounds.filter((r) => r.gir_pct != null).map((r) => r.gir_pct as number)
  const avgGir = avg(girPcts)

  // Casual (non-competitive) GIR baseline — used to flag competitive pressure-collapse rounds
  const casualGir = rounds.filter((r) => !r.is_competitive && r.gir_pct != null).map((r) => r.gir_pct as number)
  const casualGirAvg = avg(casualGir)

  function scoreLabel(rel: number) {
    if (rel === 0) return "E"
    return rel > 0 ? `+${rel.toFixed(1)}` : rel.toFixed(1)
  }

  return (
    <div className="space-y-8">

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">This Month</p>
          <p className="text-3xl font-bold tracking-tight text-white">{roundsThisMonth}</p>
          <p className="mt-1 text-xs text-[#6b7280]">{roundsThisMonth === 1 ? "round" : "rounds"}</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Avg Score</p>
          {avgScoreRel != null ? (
            <>
              <p className={[
                "text-3xl font-bold tracking-tight",
                avgScoreRel < 0 ? "text-[#22c55e]" : avgScoreRel > 0 ? "text-[#f87171]" : "text-white",
              ].join(" ")}>
                {scoreLabel(avgScoreRel)}
              </p>
              <p className="mt-1 text-xs text-[#6b7280]">to par</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-[#4b5563]">—</p>
              <p className="mt-1 text-xs text-[#4b5563]">no rounds yet</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Avg Differential</p>
          {avgDiff != null ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-white">{avgDiff.toFixed(1)}</p>
              <div className="mt-2 flex items-center gap-3 border-t border-white/[0.04] pt-2">
                <div>
                  <p className="text-xs text-[#6b7280]">Comp</p>
                  <p className="text-sm font-semibold text-[#22c55e]">
                    {avgCompDiff != null ? avgCompDiff.toFixed(1) : "—"}
                  </p>
                </div>
                <div className="h-6 w-px bg-white/[0.06]" />
                <div>
                  <p className="text-xs text-[#6b7280]">Practice</p>
                  <p className="text-sm font-semibold text-white">
                    {avgPracDiff != null ? avgPracDiff.toFixed(1) : "—"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-[#4b5563]">—</p>
              <p className="mt-1 text-xs text-[#4b5563]">add rating/slope</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Avg Fairways</p>
          {avgFairways != null ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-white">{avgFairways.toFixed(0)}%</p>
              <p className="mt-1 text-xs text-[#6b7280]">FIR</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-[#4b5563]">—</p>
              <p className="mt-1 text-xs text-[#4b5563]">no data yet</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Avg GIR</p>
          {avgGir != null ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-white">{avgGir.toFixed(0)}%</p>
              <p className="mt-1 text-xs text-[#6b7280]">greens in regulation</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-[#4b5563]">—</p>
              <p className="mt-1 text-xs text-[#4b5563]">no data yet</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Penalties / Hole</p>
          {avgPenPerHole != null ? (
            <>
              <p className={[
                "text-3xl font-bold tracking-tight",
                avgPenPerHole > 0.11 ? "text-[#f87171]" : "text-white",
              ].join(" ")}>
                {avgPenPerHole.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-[#6b7280]">per hole</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-[#4b5563]">—</p>
              <p className="mt-1 text-xs text-[#4b5563]">no data yet</p>
            </>
          )}
        </div>
      </div>

      <RoundsClient rounds={rounds} casualGirAvg={casualGirAvg} />
    </div>
  )
}
