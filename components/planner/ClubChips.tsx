"use client"

// Quick-switch row above the result card: the top-ranked clubs first, the rest
// by scrolling. Tapping one shows that club's pattern on the map.

import type { OptimizedClubPlan } from "@/lib/course/plan"

export function ClubChips({
  ranking,
  chosen,
  onPick,
  className = "flex gap-1.5 -mx-1 mb-2 px-1 pb-1",
}: {
  ranking: OptimizedClubPlan[]
  chosen: OptimizedClubPlan | null
  onPick: (r: OptimizedClubPlan) => void
  className?: string
}) {
  if (ranking.length < 2) return null
  return (
    <div className={`overflow-x-auto ${className}`} role="group" aria-label="Clubs, ranked by strokes">
      {ranking.map((r, i) => (
        <button
          key={r.club}
          type="button"
          title={`Ranked ${i + 1} of ${ranking.length} by strokes`}
          aria-pressed={chosen?.club === r.club}
          onClick={() => onPick(r)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm tabular-nums ${
            chosen?.club === r.club ? "border-accent bg-accent text-on-accent" : "border-fg/[0.12] text-fg-2"
          }`}
        >
          <span className="mr-1 text-xs opacity-60" aria-hidden>{i + 1}</span>
          {r.club}
        </button>
      ))}
    </div>
  )
}
