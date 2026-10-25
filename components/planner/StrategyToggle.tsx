"use client"

// Smart play / Go for it: the two clubs worth choosing between, each with its biggest risk. One tap picks that
// club, aimed at its best. Cards above the result card on tablets and desktops; on phones (compact) the chosen
// club and its OB or water risk, then a Smart | Go switch (hidden when both pick the same club).

import { AlertTriangle } from "lucide-react"
import { PENALTY_ICON_FROM, riskLine } from "@/lib/planner/cardLines"
import type { Options } from "@/lib/course/strategy"
import type { OptimizedClubPlan } from "@/lib/course/plan"

export function StrategyToggle({
  options,
  chosen,
  onPick,
  className = "",
  compact = false,
  onOpen,
}: {
  options: Options<OptimizedClubPlan>
  chosen: OptimizedClubPlan
  onPick: (r: OptimizedClubPlan) => void
  className?: string
  /** Phone dock: the chosen club and the switch, one row. */
  compact?: boolean
  /** Phone dock: tapping the chosen club opens the expanded dock. */
  onOpen?: (() => void) | null
}) {
  const plays = [
    ["Smart play", "Smart", options.safer, "smart"],
    ["Go for it", "Go", options.lowest, "go"],
  ] as const
  const isSelected = (r: OptimizedClubPlan, strategy: "smart" | "go") => chosen.club === r.club && (options.same || (chosen.strategy ?? "smart") === strategy)

  if (compact) {
    const risk = riskLine(chosen.plan, true)
    const chosenText = (
      <>
        <span className="text-sm font-semibold text-fg">{chosen.club}</span>
        {risk && <span className={`text-xs ${risk.warn ? "text-warn" : "text-fg-3"}`}> · {risk.text}</span>}
        {Math.max(chosen.plan.lieShare.oob, chosen.plan.lieShare.water) >= PENALTY_ICON_FROM && <AlertTriangle size={14} className="ml-1 inline text-warn" aria-label="High penalty risk" />}
      </>
    )
    return (
      <div className={`flex h-full min-w-0 items-center gap-2 ${className}`}>
        {onOpen ? (
          <button type="button" onClick={onOpen} aria-label="Shot details" className="flex h-11 min-w-0 flex-1 items-center whitespace-nowrap text-left">
            <span>{chosenText}</span>
          </button>
        ) : (
          <p className="min-w-0 flex-1 whitespace-nowrap">{chosenText}</p>
        )}
        {!options.same && (
          <div role="group" aria-label="Strategy" className="flex h-9 shrink-0 rounded-lg border border-fg/[0.12] p-0.5">
            {plays.map(([, short, r, strategy]) => (
              <button
                key={strategy}
                type="button"
                onClick={() => onPick({ ...r, strategy })}
                aria-pressed={isSelected(r, strategy)}
                className={`rounded-md px-2.5 text-sm ${isSelected(r, strategy) ? "bg-accent font-semibold text-on-accent" : "text-fg-2"}`}
              >
                {short}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`grid h-full grid-cols-2 gap-2 ${className}`}>
      {plays
        .filter((_, i) => !(options.same && i === 1))
        .map(([label, , r, strategy]) => {
          const risk = riskLine(r.plan)
          const selected = isSelected(r, strategy)
          return (
            <div key={label} className={options.same ? "col-span-2" : ""}>
              <button
                onClick={() => onPick({ ...r, strategy })}
                aria-pressed={selected}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${selected ? "border-accent bg-accent/10" : "border-fg/[0.1] hover:bg-fg/[0.04]"}`}
              >
                <span className="block truncate text-xs font-normal leading-4 text-muted">{options.same ? "Best play" : label}</span>
                <span className="block truncate text-sm leading-5">
                  <span className="font-semibold text-fg">{r.club}</span>
                  {risk && <span className={risk.warn ? " text-warn" : " text-fg-3"}> {risk.text}</span>}
                </span>
              </button>
            </div>
          )
        })}
    </div>
  )
}
