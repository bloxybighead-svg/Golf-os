"use client"

// The Play planner's result card: the club, where to aim, the distance and the one risk worth knowing.
// Everything else is in the details (DetailsPanel).

import { AlertTriangle } from "lucide-react"
import type { Lie } from "@/lib/course/lies"
import type { GreenYardages } from "@/lib/course/green"
import { isLowConfidence, type OptimizedClubPlan } from "@/lib/course/plan"
import type { Options } from "@/lib/course/strategy"
import { aimText } from "@/lib/planner/aimText"
import { playsShown, strategyLabel } from "@/lib/planner/cardLines"
import type { DetailsSection } from "./DetailsPanel"
import { Stat } from "./ui"

export interface ResultCardProps {
  best: OptimizedClubPlan
  chosen: OptimizedClubPlan
  clubChoice: string
  atBestAim: boolean
  /** Expected strokes for the chosen club aimed at the marker, as it is now. */
  chosenAtAim: number | null
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
  chosenAtAim,
  aimLie,
  distPin,
  greenYards,
  options,
  pinPlaysLike = null,
  onAimAtBest,
  onBackToBest,
  onOpenDetails,
}: ResultCardProps) {
  // Follows the aim marker: at its best aim it is the ranking's number, anywhere else the same shots aimed where the marker is.
  const strokes = !atBestAim && chosenAtAim != null ? chosenAtAim : chosen.plan.expectedStrokes
  const label = strategyLabel(options, chosen)
  const center = Math.round(greenYards?.center ?? distPin ?? NaN)
  const plays = Number.isFinite(center) ? playsShown(center, pinPlaysLike?.plays) : null
  return (
    <div className="rounded-2xl border border-fg/[0.07] bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 truncate text-5xl font-semibold leading-none tracking-tight text-fg">{chosen.club}</p>
        <p className="ml-auto shrink-0 text-right">
          <span className="block text-4xl font-semibold leading-none text-accent">{strokes.toFixed(1)}</span>
          <span className="block text-[11px] text-muted">Expected strokes</span>
        </p>
        {isLowConfidence(chosen.plan) && (
          <button
            type="button"
            onClick={() => onOpenDetails("map")}
            aria-label={`${Math.round(chosen.plan.unmappedShare * 100)}% unmapped. Show why`}
            className="-my-2 flex h-11 w-11 shrink-0 items-center justify-center self-center text-warn md:h-9 md:w-9"
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
        <p className="mt-3 border-y border-fg/[0.08] py-2 text-center">
          <span className="text-[11px] uppercase tracking-wide text-muted">To pin</span>{" "}
          <span className="text-4xl font-semibold text-fg">{Number.isFinite(center) ? center : "–"}</span>
          {plays != null && <span className="text-sm text-accent"> · plays {plays}</span>}
        </p>
      )}

      <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2 md:min-h-9">
        {label && <p className="text-xs text-muted">{label}</p>}
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
