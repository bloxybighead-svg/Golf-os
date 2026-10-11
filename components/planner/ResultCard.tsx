"use client"

// The Play planner's result card: the club, where to aim, the distance and the one risk worth knowing.
// Everything else is in the details (DetailsPanel).

import { AlertTriangle } from "lucide-react"
import type { Lie } from "@/lib/course/lies"
import type { GreenYardages } from "@/lib/course/green"
import { isLowConfidence, type OptimizedClubPlan } from "@/lib/course/plan"
import type { Options } from "@/lib/course/strategy"
import { aimText } from "@/lib/planner/aimText"
import { playsShown, riskLine, strategyLabel } from "@/lib/planner/cardLines"
import type { DetailsSection } from "./DetailsPanel"
import { Stat } from "./ui"

export interface ResultCardProps {
  best: OptimizedClubPlan
  chosen: OptimizedClubPlan
  clubChoice: string
  atBestAim: boolean
  /** The lie where the chosen club's best aim points; null until the lie map exists. */
  aimLie: Lie | null
  /** Ball to pin; the distance shown when the hole has no mapped green. */
  distPin: number | null
  /** Front, center and back of the green along the line to the pin; null with no mapped green. */
  greenYards: GreenYardages | null
  /** Smart play and Go for it, from the ranking (null until it exists); names the chosen one. */
  options: Options<OptimizedClubPlan> | null
  /** The distance to the pin as it plays for the chosen club; null when no height change or wind applies. */
  pinPlaysLike?: { plays: number } | null
  onAimAtBest: (r: OptimizedClubPlan) => void
  onBackToBest: () => void
  onOpenDetails: (section: DetailsSection) => void
}

export function ResultCard({
  best,
  chosen,
  clubChoice,
  atBestAim,
  aimLie,
  distPin,
  greenYards,
  options,
  pinPlaysLike = null,
  onAimAtBest,
  onBackToBest,
  onOpenDetails,
}: ResultCardProps) {
  const risk = riskLine(chosen.plan)
  const label = strategyLabel(options, chosen)
  const center = Math.round(greenYards?.center ?? distPin ?? NaN)
  const plays = Number.isFinite(center) ? playsShown(center, pinPlaysLike?.plays) : null
  return (
    <div className="rounded-2xl border border-fg/[0.07] bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 truncate text-5xl font-semibold leading-none tracking-tight text-fg tabular-nums">{chosen.club}</p>
        {label && <p className="shrink-0 text-xs text-muted">{label}</p>}
        {isLowConfidence(chosen.plan) && (
          <button
            type="button"
            onClick={() => onOpenDetails("map")}
            aria-label={`${Math.round(chosen.plan.unmappedShare * 100)}% unmapped. Show why`}
            className="-my-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center self-center text-warn md:h-9 md:w-9"
          >
            <AlertTriangle size={18} />
          </button>
        )}
      </div>
      <p className="mt-2 text-base text-fg">{aimText(chosen.offsetYds, aimLie)}</p>

      {greenYards ? (
        <dl className="mt-3 grid grid-cols-3 items-end divide-x divide-fg/[0.08] border-y border-fg/[0.08] py-2 text-center">
          <Stat label="Front" value={Math.round(greenYards.front)} />
          <Stat label="Center" value={center} big plays={plays} />
          <Stat label="Back" value={Math.round(greenYards.back)} />
        </dl>
      ) : (
        <p className="mt-3 border-y border-fg/[0.08] py-2 text-center tabular-nums">
          <span className="text-[11px] uppercase tracking-wide text-muted">To pin</span>{" "}
          <span className="text-4xl font-semibold text-fg">{Number.isFinite(center) ? center : "–"}</span>
          {plays != null && <span className="text-sm text-accent"> · plays {plays}</span>}
        </p>
      )}

      {risk && <p className={`mt-2 text-sm tabular-nums ${risk.warn ? "text-warn" : "text-fg-2"}`}>{risk.text}</p>}

      <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2 md:min-h-9">
        {!atBestAim && (
          <button
            onClick={() => onAimAtBest(chosen)}
            className="h-11 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 md:h-9"
          >
            Use best aim
          </button>
        )}
        {clubChoice !== "auto" && chosen.club !== best.club && (
          <button onClick={onBackToBest} className="h-11 rounded-lg border border-fg/[0.08] px-3 text-xs text-fg-3 hover:text-fg md:h-9">
            Back to best club
          </button>
        )}
        <button onClick={() => onOpenDetails("scoring")} className="ml-auto h-11 px-2 text-xs font-semibold text-fg-2 hover:text-fg md:h-9">
          Details
        </button>
      </div>
    </div>
  )
}
