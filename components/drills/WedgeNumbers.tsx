import type { ClubWorkEntry } from "@/lib/supabase/types"

// Wedges to derive numbers for, in bag order. PW included since it appears in CLUB_WORK_CLUBS.
const WEDGE_CLUBS = ["PW", "GW", "SM10 56°", "SM10 60°"] as const

export interface WedgeStat {
  club: string
  avgCarry: number | null
  sessionCount: number
}

// Averages Club Work avg_carry per wedge across all logged sessions.
// A session counts once per club if it has at least one entry with a carry number.
export function deriveWedgeStats(sessionClubWork: ClubWorkEntry[][]): WedgeStat[] {
  return WEDGE_CLUBS.map((club) => {
    const carries: number[] = []
    let sessionCount = 0
    for (const entries of sessionClubWork) {
      const withCarry = entries.filter((e) => e.club === club && e.avg_carry != null)
      if (withCarry.length === 0) continue
      sessionCount++
      carries.push(...withCarry.map((e) => e.avg_carry as number))
    }
    return {
      club,
      avgCarry: carries.length > 0 ? carries.reduce((a, b) => a + b, 0) / carries.length : null,
      sessionCount,
    }
  })
}

export function WedgeNumbers({ stats }: { stats: WedgeStat[] }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="label-xs">Wedge Numbers</p>
        <p className="text-xs text-[#4b5563]">auto-derived from Club Work · read-only</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ club, avgCarry, sessionCount }) => (
          <div key={club} className="rounded-lg border border-white/[0.04] bg-[#1a1a1a] px-3.5 py-3">
            <p className="text-xs font-medium text-[#6b7280]">{club}</p>
            {avgCarry != null ? (
              <>
                <p className="mt-1 text-xl font-bold tracking-tight text-white">
                  {Math.round(avgCarry)} <span className="text-sm font-medium text-[#6b7280]">yds avg</span>
                </p>
                <p className="mt-0.5 text-xs text-[#4b5563]">
                  based on {sessionCount} session{sessionCount !== 1 ? "s" : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-[#4b5563]">No data yet</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
