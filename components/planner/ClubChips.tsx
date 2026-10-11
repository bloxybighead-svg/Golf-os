"use client"

// The club row: the best three clubs, best first, then "More" for the full table.
// A club picked from the table that isn't in the top three takes the third chip, so the row never grows.

import { isTie, type OptimizedClubPlan } from "@/lib/course/plan"

const CHIPS_SHOWN = 3

export function ClubChips({
  ranking,
  chosen,
  onPick,
  onMore,
  className = "flex gap-1.5",
}: {
  ranking: OptimizedClubPlan[]
  chosen: OptimizedClubPlan | null
  onPick: (r: OptimizedClubPlan) => void
  onMore: () => void
  className?: string
}) {
  if (ranking.length < 2) return null
  const best = ranking[0]
  const top = ranking.slice(0, CHIPS_SHOWN)
  const shown = chosen && !top.some((r) => r.club === chosen.club) ? [...top.slice(0, CHIPS_SHOWN - 1), chosen] : top
  return (
    <div className={className} role="group" aria-label="Clubs, best first">
      {shown.map((r) => (
        <button
          key={r.club}
          type="button"
          aria-pressed={chosen?.club === r.club}
          onClick={() => onPick(r)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm tabular-nums ${
            chosen?.club === r.club ? "border-accent bg-accent text-on-accent" : "border-fg/[0.12] text-fg-2"
          }`}
        >
          {r.club}
          {r !== best && isTie(r.plan, best.plan) && <span title="Ties with the best club"> ≈</span>}
        </button>
      ))}
      <button type="button" onClick={onMore} className="shrink-0 rounded-full border border-fg/[0.12] px-3 py-1.5 text-sm text-fg-3">
        More
      </button>
    </div>
  )
}
