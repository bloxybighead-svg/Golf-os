"use client"

// Quick-switch row above the result card: the top-ranked clubs first, the rest
// by scrolling. Tapping one shows that club's pattern on the map.

import { Fragment } from "react"
import type { OptimizedClubPlan } from "@/lib/course/plan"
import { usePartialGroups } from "./usePartialGroups"

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
  const { groups, isOpen, toggle } = usePartialGroups(ranking, chosen)
  if (ranking.length < 2) return null
  const chip = (r: OptimizedClubPlan, rank: number) => (
    <button
      key={r.club}
      type="button"
      title={`Ranked ${rank} of ${ranking.length} by strokes`}
      aria-pressed={chosen?.club === r.club}
      onClick={() => onPick(r)}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm tabular-nums ${
        chosen?.club === r.club ? "border-accent bg-accent text-on-accent" : "border-fg/[0.12] text-fg-2"
      }`}
    >
      <span className="mr-1 text-xs opacity-60" aria-hidden>{rank}</span>
      {r.club}
    </button>
  )
  return (
    <div className={`overflow-x-auto ${className}`} role="group" aria-label="Clubs, ranked by strokes">
      {groups.map((g) => (
        <Fragment key={g.row.club}>
          {chip(g.row, g.rank)}
          {g.partials.length > 0 && (
            <button
              type="button"
              aria-expanded={isOpen(g.row.club)}
              aria-label={`${g.row.club} partial swings`}
              onClick={() => toggle(g.row.club)}
              className="shrink-0 rounded-full border border-fg/[0.12] px-2.5 py-1.5 text-sm text-muted"
            >
              {isOpen(g.row.club) ? "‹" : "›"}
            </button>
          )}
          {isOpen(g.row.club) && g.partials.map((p) => chip(p.row, p.rank))}
        </Fragment>
      ))}
    </div>
  )
}
