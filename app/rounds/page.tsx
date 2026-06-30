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

  // Stats
  const monthStart = startOfMonthISO()
  const roundsThisMonth = rounds.filter((r) => r.date >= monthStart).length

  const scores = rounds.map((r) => r.score)
  const avgScore = avg(scores)

  const puttCounts = rounds.filter((r) => r.total_putts != null).map((r) => r.total_putts as number)
  const avgPutts = avg(puttCounts)

  return (
    <div className="space-y-8">

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">This Month</p>
          <p className="text-3xl font-bold tracking-tight text-white">{roundsThisMonth}</p>
          <p className="mt-1 text-xs text-[#6b7280]">
            {roundsThisMonth === 1 ? "round" : "rounds"}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Avg Score</p>
          {avgScore != null ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-white">
                {avgScore.toFixed(1)}
              </p>
              {rounds[0] && (
                <p className="mt-1 text-xs text-[#6b7280]">
                  par {rounds[0].par} course avg
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-[#4b5563]">—</p>
              <p className="mt-1 text-xs text-[#4b5563]">no rounds yet</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Avg Putts</p>
          {avgPutts != null ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-white">
                {avgPutts.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-[#6b7280]">per round</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-[#4b5563]">—</p>
              <p className="mt-1 text-xs text-[#4b5563]">no data yet</p>
            </>
          )}
        </div>
      </div>

      <RoundsClient rounds={rounds} />
    </div>
  )
}
