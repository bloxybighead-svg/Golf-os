import type { ClubWorkEntry } from "@/lib/supabase/types"
import { FEEL_LABELS } from "@/lib/supabase/types"

// Wedges to derive numbers for, in bag order. PW included since it appears in CLUB_WORK_CLUBS.
const WEDGE_CLUBS = ["PW", "GW", "SM10 56°", "SM10 60°"] as const

export interface WedgeFeelStat {
  feel: string
  avgCarry: number
  sessionCount: number
}

export interface WedgeStat {
  club: string
  feels: WedgeFeelStat[]
}

// Averages Club Work avg_carry per wedge AND feel across all logged sessions.
// Entries without a feel selected are excluded entirely — they'd pollute the
// per-feel averages if lumped into a generic bucket.
export function deriveWedgeStats(sessionClubWork: ClubWorkEntry[][]): WedgeStat[] {
  return WEDGE_CLUBS.map((club) => {
    const feels: WedgeFeelStat[] = []
    for (const feel of FEEL_LABELS) {
      const carries: number[] = []
      let sessionCount = 0
      for (const entries of sessionClubWork) {
        const matching = entries.filter(
          (e) => e.club === club && e.feel === feel && e.avg_carry != null
        )
        if (matching.length === 0) continue
        sessionCount++
        carries.push(...matching.map((e) => e.avg_carry as number))
      }
      if (carries.length > 0) {
        feels.push({
          feel,
          avgCarry: carries.reduce((a, b) => a + b, 0) / carries.length,
          sessionCount,
        })
      }
    }
    return { club, feels }
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
        {stats.map(({ club, feels }) => (
          <div key={club} className="rounded-lg border border-white/[0.04] bg-[#1a1a1a] px-3.5 py-3">
            <p className="text-xs font-medium text-[#6b7280]">{club}</p>
            {feels.length > 0 ? (
              <div className="mt-1.5 space-y-1.5">
                {feels.map(({ feel, avgCarry, sessionCount }) => (
                  <div key={feel} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-[#9ca3af]">{feel}</span>
                    <span className="text-sm font-bold tracking-tight text-white">
                      {Math.round(avgCarry)}
                      <span className="ml-1 text-[10px] font-normal text-[#4b5563]">
                        yds · {sessionCount} sess
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-[#4b5563]">No data yet</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[#4b5563]">
        Grouped by club + feel. Club Work entries without a feel selected aren&apos;t counted here.
      </p>
    </div>
  )
}
