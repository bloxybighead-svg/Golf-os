"use client"

// The Play planner's result card: best (or picked) club, strokes, distances,
// data-quality line (moved verbatim from CourseMapClient.tsx).

import { AlertTriangle, Check, X } from "lucide-react"
import type { CourseGeometry, CourseHole } from "@/lib/course/overpass"
import type { Lie } from "@/lib/course/lies"
import { boundaryStatus, type ConfirmableHazard, type HoleDataQuality, type SurfaceStatus } from "@/lib/course/dataQuality"
import type { GreenYardages } from "@/lib/course/green"

const COLD_BALL_TIP = "Cold day: keep your ball in your pocket between shots. A cold ball loses far more distance than cold air."
import { flagsUnmapped, isLowConfidence, isTie, type ClubPlan, type OptimizedClubPlan } from "@/lib/course/plan"
import { SMART_MAX_PENALTY_RATE, pctText, penaltyShare, penaltyWord, type Options } from "@/lib/course/strategy"
import { aimText } from "@/lib/planner/aimText"
import { pct, STATUS_TITLE } from "@/lib/planner/labels"
import { Stat } from "./ui"
import { StrategyToggle } from "./StrategyToggle"

/** A strokes difference as "+0.07" / "-0.07". */
const signed = (d: number) => `${d < 0 ? "-" : "+"}${Math.abs(d).toFixed(2)}`

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="text-muted">{label}</span> <span className="tabular-nums text-fg-2">{children}</span>
    </p>
  )
}

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
  /** The lie where the chosen club's best aim points; null until the lie map exists. */
  aimLie: Lie | null
  chosenAtAim: number | null
  /** Ball to pin; the center number when the hole has no mapped green. */
  distPin: number | null
  /** Front, center and back of the green along the line to the pin; null with no mapped green. */
  greenYards: GreenYardages | null
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
  /** The distance to the pin as it plays for the chosen club (height change, wind): the number and its adjustments as shown; null when neither applies. */
  pinPlaysLike?: { plays: number; breakdown: string } | null
  /** The air is under COLD_TIP_BELOW_F: show the cold-ball tip. */
  coldTip?: boolean
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
  aimLie,
  chosenAtAim,
  distPin,
  greenYards,
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
  coldTip = false,
}: ResultCardProps) {
  const penalty = penaltyShare(chosen.plan)
  const overCap = penalty > SMART_MAX_PENALTY_RATE
  const centerYds = greenYards?.center ?? distPin
  const center = centerYds != null ? Math.round(centerYds) : null
  // The option this one is measured against: the best club when you picked another, else Smart play's other option.
  const other =
    chosen.club !== best.club
      ? best
      : options && !options.same
        ? (chosen.strategy ?? "smart") === "go"
          ? options.safer
          : options.lowest
        : null
  const gap = other ? chosen.plan.expectedStrokes - other.plan.expectedStrokes : 0
  return (
    <div className="rounded-2xl border border-fg/[0.07] bg-surface p-4">
      {options && <StrategyToggle options={options} chosen={chosen} onPick={onPickOption} className="mb-3 hidden md:grid" />}
      {clubChoice !== "auto" && chosen.club !== best.club && <p className="label-xs">Your pick</p>}
      <p className="truncate text-5xl font-semibold leading-none tracking-tight text-fg tabular-nums">{chosen.club}</p>
      <p className="mt-2 text-base text-fg">{aimText(chosen.offsetYds, aimLie)}</p>

      <dl className="mt-3 grid grid-cols-3 items-end divide-x divide-fg/[0.08] border-y border-fg/[0.08] py-2 text-center">
        <Stat label="Front" value={greenYards ? Math.round(greenYards.front) : null} />
        <Stat label="Center" value={center} big plays={pinPlaysLike && center != null && Math.abs(pinPlaysLike.plays - center) >= 1 ? pinPlaysLike.plays : null} />
        <Stat label="Back" value={greenYards ? Math.round(greenYards.back) : null} />
      </dl>

      <p className="mt-2 text-sm tabular-nums text-fg-2" title="Share of shots that finish out of bounds or in water (a penalty stroke), and the average distance left to the pin">
        <span className={overCap ? "font-semibold text-danger" : ""}>
          {pctText(penalty)} {penaltyWord(chosen.plan)}
        </span>
        {avgLeft != null && <> · leaves ~{Math.round(avgLeft)}</>}
      </p>

      {(!atBestAim || clubChoice !== "auto") && (
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
      )}

      <details className="mt-3 border-t border-fg/[0.08] pt-2 text-xs">
        <summary className="flex min-h-11 cursor-pointer select-none items-center font-semibold text-fg-2 md:min-h-9">Why</summary>
        <div className="space-y-1 pb-1">
          <Row label="Expected strokes">{chosen.plan.expectedStrokes.toFixed(1)}</Row>
          {other && (
            <Row label={`vs ${other.club}`}>
              {signed(gap)}
              {(gap >= 0 ? isTie(chosen.plan, other.plan) : isTie(other.plan, chosen.plan)) ? " (a tie, within the noise)" : ""}
            </Row>
          )}
          {!atBestAim && chosenAtAim != null && <Row label="At your aim">{signed(chosenAtAim - chosen.plan.expectedStrokes)}</Row>}
          <Row label="Scored against">{baselineHandicap == null ? "PGA TOUR" : `a ${baselineHandicap.toFixed(1)} handicap`}</Row>
          {shotsLabel && <Row label="Shots">{shotsLabel}</Row>}
          <Row label="Finishes">
            ~{Math.round(chosenLive.meanTotalYds)} yd (carry {Math.round(chosenLive.meanCarryYds)})
          </Row>
          {estimateNotes[chosen.club] && <p className="text-fg-3">{estimateNotes[chosen.club]}.</p>}
          {options?.tradeoff && <p className="text-fg-2">{options.tradeoff}</p>}
          {pinPlaysLike?.breakdown && <p className="tabular-nums text-fg-3">{pinPlaysLike.breakdown}</p>}
          {coldTip && <p className="text-fg-3">{COLD_BALL_TIP}</p>}
          <p className="text-fg-3">
            From {fromLabel}
            {hole && !!hole.correctedFields?.length && <span title={`Corrected: ${hole.correctedFields.join(", ")}`}> · corrected</span>}
            {hole && (
              <>
                {" · "}
                <button onClick={onEditHole} className="hover:text-fg hover:underline">
                  Edit hole
                </button>
              </>
            )}
          </p>

      {isLowConfidence(chosen.plan) ? (
        <p className="text-fg-2" data-testid="unmapped-warning">
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
        <p className="text-fg-3">
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
        </div>
      </details>
    </div>
  )
}
