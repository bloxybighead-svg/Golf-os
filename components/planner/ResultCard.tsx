"use client"

// The Play planner's result card: best (or picked) club, strokes, distances,
// data-quality line (moved verbatim from CourseMapClient.tsx).

import { AlertTriangle, Check, X } from "lucide-react"
import type { CourseGeometry, CourseHole } from "@/lib/course/overpass"
import type { Lie } from "@/lib/course/lies"
import { boundaryStatus, type ConfirmableHazard, type HoleDataQuality, type SurfaceStatus } from "@/lib/course/dataQuality"
import type { PlaysLike } from "@/lib/course/playsLike"
import { flagsUnmapped, isLowConfidence, isTie, type ClubPlan, type OptimizedClubPlan } from "@/lib/course/plan"
import { PENALTY_CAP, pctText, penaltyShare, penaltyWord, type Options } from "@/lib/course/strategy"
import { pct, STATUS_TITLE } from "@/lib/planner/labels"
import { Stat } from "./ui"
import { StrategyToggle } from "./StrategyToggle"

export interface ResultCardProps {
  best: OptimizedClubPlan
  chosen: OptimizedClubPlan
  /** The chosen club at the aim marker, with every shot (what the dots show). */
  chosenLive: ClubPlan
  clubChoice: string
  fromLabel: string
  hole: CourseHole | null
  baselineHandicap: number | null
  atBestAim: boolean
  chosenAtAim: number | null
  distAim: number | null
  distPin: number | null
  aimToPin: number | null
  aimIsPin: boolean
  avgLeft: number | null
  estimateNotes: Record<string, string>
  holeQuality: HoleDataQuality | null
  geometry: CourseGeometry | null
  onEditHole: () => void
  onStartDraw: (lie: Lie) => void
  onConfirmHazard: (hazard: ConfirmableHazard, value: boolean) => void
  onAimAtBest: (r: OptimizedClubPlan) => void
  onBackToBest: () => void
  /** Smart play (the default) and Go for it, from the ranking (null until it exists). */
  options: (Options<OptimizedClubPlan> & { tradeoff: string | null }) | null
  /** Whose shots these are ("My shots", "Handicap estimate"), shown under the baseline line. */
  shotsLabel?: string
  /** Taps an option: that club, aimed at its best. */
  onPickOption: (r: OptimizedClubPlan) => void
  /** The distance to the pin as it plays for the chosen club (height change, wind), with its breakdown; null when neither applies. */
  pinPlaysLike?: (PlaysLike & { breakdown: string }) | null
}

export function ResultCard({
  best,
  chosen,
  chosenLive,
  clubChoice,
  fromLabel,
  hole,
  baselineHandicap,
  atBestAim,
  chosenAtAim,
  distAim,
  distPin,
  aimToPin,
  aimIsPin,
  avgLeft,
  estimateNotes,
  holeQuality,
  geometry,
  onEditHole,
  onStartDraw,
  onConfirmHazard,
  onAimAtBest,
  onBackToBest,
  options,
  onPickOption,
  shotsLabel,
  pinPlaysLike = null,
}: ResultCardProps) {
  const penalty = penaltyShare(chosen.plan)
  const overCap = penalty > PENALTY_CAP
  return (
    <div className="rounded-2xl border border-fg/[0.07] bg-surface p-4">
      {options && <StrategyToggle options={options} chosen={chosen} onPick={onPickOption} className="mb-3 hidden md:grid" />}
      <div className="flex items-baseline justify-between gap-2">
        <p className="label-xs">
          {clubChoice === "auto" || chosen.club === best.club ? (
            "Best club"
          ) : (
            <>
              Your pick ·{" "}
              <span className="normal-case tracking-normal">
                Best: {best.club} (+{(chosen.plan.expectedStrokes - best.plan.expectedStrokes).toFixed(2)})
              </span>
            </>
          )}
        </p>
        <p className="text-xs text-muted">
          From {fromLabel}
          {hole && !!hole.correctedFields?.length && (
            <span title={`Corrected: ${hole.correctedFields.join(", ")}`}> · corrected</span>
          )}
          {hole && (
            <>
              {" · "}
              <button onClick={onEditHole} className="hover:text-fg hover:underline">
                Edit hole
              </button>
            </>
          )}
        </p>
      </div>

      <div className="mt-1 flex items-end justify-between gap-4">
        <p className="min-w-0 truncate text-5xl font-semibold leading-none tracking-tight text-fg tabular-nums">{chosen.club}</p>
        <p className="shrink-0 text-right">
          <span className="block text-4xl font-semibold leading-none text-accent tabular-nums">
            {chosen.plan.expectedStrokes.toFixed(2)}
          </span>
          <span className="text-xs text-muted">strokes to hole out</span>
          <span className={`block text-xs tabular-nums ${overCap ? "font-semibold text-danger" : "text-fg-3"}`} title="Share of shots that finish out of bounds, in water or in trees (a drop, punch-out or lost ball)">
            {pctText(penalty)} {penaltyWord(chosen.plan)} / penalty
          </span>
          <span className="block text-[11px] text-muted" title="Change on You, under Planner">
            vs {baselineHandicap == null ? "PGA TOUR" : `a ${baselineHandicap.toFixed(1)} handicap`}
          </span>
          {shotsLabel && (
            <span className="block text-[11px] text-muted" title="Whose shots the planner uses. Change it in the course sheet, under Shots.">
              Shots: {shotsLabel}
            </span>
          )}
          {!atBestAim && chosenAtAim != null && (
            <span className="block text-xs text-fg-3" title="The same shots, aimed where the marker is now">
              At your aim <span className="font-semibold tabular-nums">{chosenAtAim.toFixed(2)}</span>
            </span>
          )}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-fg/[0.08] border-y border-fg/[0.08] py-2 text-center">
        <Stat label="Aim line" value={distAim != null ? Math.round(distAim) : null} />
        <Stat label={aimIsPin ? "Aim is pin" : "Aim to pin"} value={aimIsPin ? 0 : aimToPin != null ? Math.round(aimToPin) : null} />
        <Stat label="To pin" value={distPin != null ? Math.round(distPin) : null} plays={pinPlaysLike && distPin != null ? Math.round(pinPlaysLike.playsYds) : null} />
      </dl>
      {pinPlaysLike?.breakdown && <p className="mt-1 text-[11px] text-fg-3 tabular-nums">{pinPlaysLike.breakdown}</p>}

      <p className="mt-2 text-xs text-fg-3">
        Finishes ~<span className="tabular-nums">{Math.round(chosenLive.meanTotalYds)}</span> yd (carry{" "}
        <span className="tabular-nums">{Math.round(chosenLive.meanCarryYds)}</span>)
        {avgLeft != null && (
          <>
            , leaves <span className="font-semibold text-fg tabular-nums">{Math.round(avgLeft)}</span> yd
          </>
        )}
        .
        {estimateNotes[chosen.club] && <> {estimateNotes[chosen.club]}.</>}
        {chosen.club !== best.club &&
          (isTie(chosen.plan, best.plan) ? (
            <> A tie with the {best.club}: the gap is within the noise of the shot samples.</>
          ) : (
            <>
              {" "}
              {best.club} saves{" "}
              <span className="font-semibold text-accent tabular-nums">
                {(chosen.plan.expectedStrokes - best.plan.expectedStrokes).toFixed(2)}
              </span>{" "}
              strokes.
            </>
          ))}
      </p>

      {options?.noSafeOption && (
        <p className="mt-2 text-xs font-semibold text-danger">
          Risky hole: even the smart play, {options.safer.club}, has {pctText(penaltyShare(options.safer.plan))}{" "}
          {penaltyWord(options.safer.plan)} risk.
        </p>
      )}
      {options?.tradeoff && <p className="mt-2 text-xs text-fg-2">{options.tradeoff}</p>}

      {isLowConfidence(chosen.plan) ? (
        <p className="mt-2 text-xs text-fg-2" data-testid="unmapped-warning">
          <span className="font-semibold text-warn">{pct(chosen.plan.unmappedShare)}</span> of this pattern is on unmapped ground. Check the
          map, mark{" "}
          <button onClick={() => onStartDraw("trees")} className="font-semibold text-accent hover:underline">
            trees
          </button>
          /
          <button onClick={() => onStartDraw("oob")} className="font-semibold text-accent hover:underline">
            OB
          </button>{" "}
          if needed.
        </p>
      ) : (
        flagsUnmapped(chosenLive) && (
        <p className="mt-2 text-[11px] text-fg-3">
          <span className="font-semibold text-warn">{pct(chosenLive.unmappedShare)}</span> of shots landed on unmapped ground.
          Draw{" "}
          <button onClick={() => onStartDraw("trees")} className="font-semibold text-accent hover:underline">
            trees
          </button>{" "}
          or{" "}
          <button onClick={() => onStartDraw("oob")} className="font-semibold text-accent hover:underline">
            out of bounds
          </button>{" "}
          to sharpen this.
        </p>
        )
      )}

      {holeQuality && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {(
            [
              ["fairway", "Fairway", holeQuality.fairway],
              ["greens", "Greens", holeQuality.greens],
              ["bunkers", "Bunkers", holeQuality.bunkers],
              ["water", "Water", holeQuality.water],
            ] as [keyof HoleDataQuality, string, SurfaceStatus][]
          ).map(([key, label, status]) => {
            const icon =
              status === "mapped" || status === "confirmed-absent" ? (
                <Check size={12} className="text-accent" />
              ) : status === "missing" ? (
                <X size={12} className="text-danger" />
              ) : (
                <AlertTriangle size={12} className="text-warn" />
              )
            return status === "confirmed-absent" ? (
              <button
                key={key}
                onClick={() => onConfirmHazard(key as ConfirmableHazard, false)}
                className="flex items-center gap-1 hover:opacity-75"
                title={STATUS_TITLE[status]}
              >
                {icon}
                <span className="text-fg-3">{label}</span>
              </button>
            ) : (
              <span key={key} className="flex items-center gap-1" title={STATUS_TITLE[status]}>
                {icon}
                <span className="text-fg-3">{label}</span>
              </span>
            )
          })}
          <span className="flex items-center gap-1" title={STATUS_TITLE[boundaryStatus(geometry)]}>
            {boundaryStatus(geometry) === "mapped" ? (
              <Check size={12} className="text-accent" />
            ) : (
              <X size={12} className="text-danger" />
            )}
            <span className="text-fg-3">Boundary</span>
          </span>
        </div>
      )}
      {holeQuality &&
        (holeQuality.fairway === "estimated" ||
          holeQuality.bunkers === "missing" ||
          holeQuality.water === "missing" ||
          holeQuality.greens === "missing" ||
          boundaryStatus(geometry) === "missing") && (
          <div className="mt-1.5 space-y-1 text-[11px] text-fg-3">
            {boundaryStatus(geometry) === "missing" && (
              <p>
                No course boundary mapped: nothing counts as out of bounds unless you mark it.{" "}
                <button onClick={() => onStartDraw("oob")} className="font-semibold text-accent hover:underline">
                  Mark out of bounds
                </button>
              </p>
            )}
            {holeQuality.fairway === "estimated" && (
              <p>
                Fairway estimated.{" "}
                <button onClick={() => onStartDraw("fairway")} className="font-semibold text-accent hover:underline">
                  Mark fairway
                </button>
              </p>
            )}
            {holeQuality.bunkers === "missing" && (
              <p>
                Bunkers not mapped.{" "}
                <button onClick={() => onStartDraw("bunker")} className="font-semibold text-accent hover:underline">
                  Mark bunkers
                </button>
                {" · "}
                <button onClick={() => onConfirmHazard("bunkers", true)} className="hover:text-fg hover:underline">
                  None here
                </button>
              </p>
            )}
            {holeQuality.water === "missing" && (
              <p>
                Water not mapped.{" "}
                <button onClick={() => onStartDraw("water")} className="font-semibold text-accent hover:underline">
                  Mark water
                </button>
                {" · "}
                <button onClick={() => onConfirmHazard("water", true)} className="hover:text-fg hover:underline">
                  None here
                </button>
              </p>
            )}
            {holeQuality.greens === "missing" && (
              <p>
                Green not mapped.{" "}
                <button onClick={() => onStartDraw("green")} className="font-semibold text-accent hover:underline">
                  Mark green
                </button>
              </p>
            )}
          </div>
        )}

      <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2 md:min-h-9">
        {!atBestAim && (
          <button
            onClick={() => onAimAtBest(chosen)}
            className="h-11 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 md:h-9"
          >
            Use best aim
          </button>
        )}
        {clubChoice !== "auto" && (
          <button
            onClick={onBackToBest}
            className="h-11 rounded-lg border border-fg/[0.08] px-3 text-xs text-fg-3 hover:text-fg md:h-9"
          >
            Back to best club
          </button>
        )}
      </div>
    </div>
  )
}
