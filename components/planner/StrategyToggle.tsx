"use client"

// Smart play / Go for it: the two clubs worth choosing between, each with its
// strokes and penalty share. One tap picks that club, aimed at its best. Shown
// in the result card on tablets and desktops, and in the dock on phones.

import { penaltyShare, pctText, penaltyWord, PENALTY_CAP, type Options } from "@/lib/course/strategy"
import type { OptimizedClubPlan } from "@/lib/course/plan"

export function StrategyToggle({
  options,
  chosen,
  onPick,
  className = "",
  compact = false,
}: {
  options: Options<OptimizedClubPlan>
  chosen: OptimizedClubPlan
  onPick: (r: OptimizedClubPlan) => void
  className?: string
  /** Phone dock: one tight row each, no club name above the label. */
  compact?: boolean
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      {(
        [
          ["Smart play", options.safer],
          ["Go for it", options.lowest],
        ] as const
      )
        .filter((_, i) => !(options.same && i === 1))
        .map(([label, r], i) => {
          const pen = penaltyShare(r.plan)
          const selected = chosen.club === r.club && (options.same || i === (chosen.club === options.safer.club ? 0 : 1))
          return (
            <button
              key={label}
              onClick={() => onPick(r)}
              aria-pressed={selected}
              className={`rounded-xl border px-3 text-left transition-colors ${compact ? "h-[3.5rem] py-1" : "py-2"} ${options.same ? "col-span-2" : ""} ${
                selected ? "border-accent bg-accent/10" : "border-fg/[0.1] hover:bg-fg/[0.04]"
              }`}
            >
              <span className="block text-xs font-medium text-muted">{options.same ? "Best play" : label}</span>
              <span className={`block font-semibold text-fg ${compact ? "text-sm leading-tight" : "text-base"}`}>{r.club}</span>
              <span className="block text-xs tabular-nums text-fg-3">
                {r.plan.expectedStrokes.toFixed(2)} strokes ·{" "}
                <span className={pen > PENALTY_CAP ? "font-semibold text-danger" : ""}>
                  {pctText(pen)} {penaltyWord(r.plan)}
                </span>
              </span>
            </button>
          )
        })}
    </div>
  )
}
