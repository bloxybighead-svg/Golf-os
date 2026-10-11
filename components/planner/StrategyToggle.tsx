"use client"

// Smart play / Go for it: the two clubs worth choosing between, each with its
// strokes and penalty share. One tap picks that club, aimed at its best. Shown
// in the result card on tablets and desktops, and in the dock on phones.

import { AlertTriangle } from "lucide-react"
import { penaltyShare, pctText, penaltyWord, SMART_MAX_PENALTY_RATE, troubleShare, type Options } from "@/lib/course/strategy"
import type { OptimizedClubPlan } from "@/lib/course/plan"

/** Brings the visible unmapped-ground explanation in the result card to the middle of the screen. */
function showUnmappedExplanation() {
  const shown = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="unmapped-warning"]')).find((el) => el.offsetParent !== null)
  shown?.scrollIntoView({ behavior: "smooth", block: "center" })
}

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
  /** Phone dock: each card is exactly two lines, truncating. */
  compact?: boolean
  /** Share (0 to 1) of the chosen club's pattern on unmapped ground when it is over the advisory line; puts a warning icon on that card. */
  unmappedWarning?: number | null
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
          const pen = penaltyShare(r.plan)
          const trees = troubleShare(r.plan)
          const selected = chosen.club === r.club && (options.same || (chosen.strategy ?? "smart") === strategy)
          const warned = unmappedWarning != null && chosen.club === r.club
          const name = options.same ? "Best play" : label
          const strokes = `${r.plan.expectedStrokes.toFixed(2)} strokes`
          const penalty = (
            <span className={pen > SMART_MAX_PENALTY_RATE ? "font-semibold text-danger" : ""}>
              {pctText(pen)} {penaltyWord(r.plan)}
            </span>
          )
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
                      <span className="font-medium text-muted">{name}</span> <span className="font-semibold text-fg">{r.club}</span>
                    </span>
                    <span className="block truncate text-xs leading-4 tabular-nums text-fg-3">
                      {strokes} · {penalty}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block text-xs font-medium text-muted">{name}</span>
                    <span className="block text-base font-semibold text-fg">{r.club}</span>
                    <span className="block text-xs tabular-nums text-fg-3">
                      {strokes} · {penalty}
                      {trees >= 0.005 && <> · {pctText(trees)} trees</>}
                    </span>
                  </>
                )}
              </button>
              {warned && (
                <button
                  type="button"
                  onClick={showUnmappedExplanation}
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
