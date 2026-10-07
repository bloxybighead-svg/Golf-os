"use client"

// Smart play / Go for it: the two clubs worth choosing between, each with its
// strokes and penalty share. One tap picks that club, aimed at its best. Shown
// in the result card on tablets and desktops, and in the dock on phones.

import { penaltyShare, pctText, penaltyWord, SMART_MAX_PENALTY_RATE, type Options } from "@/lib/course/strategy"
import type { OptimizedClubPlan } from "@/lib/course/plan"

export function StrategyToggle({
  options,
  chosen,
  onPick,
  className = "",
  compact = false,
  unmappedWarning = null,
}: {
  options: Options<OptimizedClubPlan>
  chosen: OptimizedClubPlan
  onPick: (r: OptimizedClubPlan) => void
  className?: string
  /** Phone dock: one tight row each, no club name above the label. */
  compact?: boolean
  /** Share (0 to 1) of the chosen club's pattern on unmapped ground when it is over the advisory line; flags that card. */
  unmappedWarning?: number | null
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      {(
        [
          ["Smart play", options.safer, "smart"],
          ["Go for it", options.lowest, "go"],
        ] as const
      )
        .filter((_, i) => !(options.same && i === 1))
        .map(([label, r, strategy]) => {
          const pen = penaltyShare(r.plan)
          const selected = chosen.club === r.club && (options.same || (chosen.strategy ?? "smart") === strategy)
          return (
            <button
              key={label}
              onClick={() => onPick({ ...r, strategy })}
              aria-pressed={selected}
              className={`rounded-xl border px-3 text-left transition-colors ${compact ? "h-[3.5rem] py-1" : "py-2"} ${options.same ? "col-span-2" : ""} ${
                selected ? "border-accent bg-accent/10" : "border-fg/[0.1] hover:bg-fg/[0.04]"
              }`}
            >
              <span className="block text-xs font-medium text-muted">{options.same ? "Best play" : label}
                {unmappedWarning != null && chosen.club === r.club && (
                  <span className="font-semibold text-warn" title="Much of this pattern lands on unmapped ground. Check the map below.">
                    {" "}
                    · {Math.round(unmappedWarning * 100)}% unmapped
                  </span>
                )}
              </span>
              <span className={`block font-semibold text-fg ${compact ? "text-sm leading-tight" : "text-base"}`}>{r.club}</span>
              <span className="block text-xs tabular-nums text-fg-3">
                {r.plan.expectedStrokes.toFixed(2)} strokes ·{" "}
                <span className={pen > SMART_MAX_PENALTY_RATE ? "font-semibold text-danger" : ""}>
                  {pctText(pen)} {penaltyWord(r.plan)}
                </span>
              </span>
            </button>
          )
        })}
    </div>
  )
}
