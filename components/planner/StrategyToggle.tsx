"use client"

// Smart play / Go for it: the two clubs worth choosing between, each with its biggest risk. One tap picks that
// club, aimed at its best. A segmented control above the card on tablets and desktops, and in the dock on phones
// (compact: club and name on line one, expected strokes and the biggest risk on line two).

import { AlertTriangle } from "lucide-react"
import { riskLine } from "@/lib/planner/cardLines"
import type { Options } from "@/lib/course/strategy"
import type { OptimizedClubPlan } from "@/lib/course/plan"

export function StrategyToggle({
  options,
  chosen,
  onPick,
  className = "",
  compact = false,
  unmappedWarning = null,
  onUnmapped,
}: {
  options: Options<OptimizedClubPlan>
  chosen: OptimizedClubPlan
  onPick: (r: OptimizedClubPlan) => void
  className?: string
  /** Phone dock: each card is exactly two lines, truncating. */
  compact?: boolean
  /** Share (0 to 1) of the chosen club's pattern on unmapped ground when it is over the advisory line; puts a warning icon on that card. */
  unmappedWarning?: number | null
  /** Opens the details at the Map section; the warning icon's tap. */
  onUnmapped?: () => void
}) {
  return (
    <div className={`grid h-full grid-cols-2 gap-2 ${className}`}>
      {(
        [
          ["Smart play", options.safer, "smart"],
          ["Go for it", options.lowest, "go"],
        ] as const
      )
        .filter((_, i) => !(options.same && i === 1))
        .map(([label, r, strategy]) => {
          const risk = riskLine(r.plan)
          const selected = chosen.club === r.club && (options.same || (chosen.strategy ?? "smart") === strategy)
          const warned = unmappedWarning != null && chosen.club === r.club
          const name = options.same ? "Best play" : label
          return (
            <div key={label} className={`relative ${compact ? "h-full min-w-0" : ""} ${options.same ? "col-span-2" : ""}`}>
              <button
                onClick={() => onPick({ ...r, strategy })}
                aria-pressed={selected}
                className={`w-full rounded-xl border px-3 text-left transition-colors ${compact ? `flex h-full flex-col justify-center overflow-hidden ${warned ? "pr-8" : ""}` : "py-2"} ${
                  selected ? "border-accent bg-accent/10" : "border-fg/[0.1] hover:bg-fg/[0.04]"
                }`}
              >
                {compact ? (
                  <>
                    <span className="block truncate text-sm leading-5">
                      <span className="font-semibold text-fg">{r.club}</span>
                      <span className="text-xs text-muted"> {name}</span>
                    </span>
                    <span className="block truncate text-xs leading-4 tabular-nums">
                      <span className="text-fg-2">{r.plan.expectedStrokes.toFixed(1)}</span>
                      {risk && <span className={risk.warn ? "text-warn" : "text-fg-3"}> · {risk.text}</span>}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block truncate text-xs font-medium leading-4 text-muted">{name}</span>
                    <span className="block truncate text-sm leading-5 tabular-nums">
                      <span className="font-semibold text-fg">{r.club}</span>
                      {risk && <span className={risk.warn ? " text-warn" : " text-fg-3"}> {risk.text}</span>}
                    </span>
                  </>
                )}
              </button>
              {warned && onUnmapped && (
                <button
                  type="button"
                  onClick={onUnmapped}
                  aria-label={`${Math.round(unmappedWarning * 100)}% unmapped. Show why`}
                  className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center text-warn"
                >
                  <AlertTriangle size={16} />
                </button>
              )}
            </div>
          )
        })}
    </div>
  )
}
