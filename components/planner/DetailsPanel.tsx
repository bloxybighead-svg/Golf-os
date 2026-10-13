"use client"

// The result card's details: one bottom sheet on phones, an expandable section under the card from tablet up.
// Three groups: Conditions (wind, temperature, elevation, plays-like), Map (what is mapped and how to fix it) and
// How it's scored (the numbers behind the card).

import { useEffect, useRef } from "react"
import { AlertTriangle, Check, X } from "lucide-react"
import type { WindState } from "@/hooks/useWind"
import type { Lie } from "@/lib/course/lies"
import type { CourseGeometry, CourseHole } from "@/lib/course/overpass"
import { boundaryStatus, type ConfirmableHazard, type HoleDataQuality, type SurfaceStatus } from "@/lib/course/dataQuality"
import { flagsUnmapped, isLowConfidence, isTie, type ClubPlan, type OptimizedClubPlan } from "@/lib/course/plan"
import type { Options } from "@/lib/course/strategy"
import { CARRY_FINISH_DIFFER_YDS, otherOption } from "@/lib/planner/cardLines"
import { pct, STATUS_TITLE } from "@/lib/planner/labels"
import { ScoringDetails } from "./ScoringDetails"
import { WindControl } from "./WindControl"

export type DetailsSection = "conditions" | "map" | "scoring"

const COLD_BALL_TIP = "Cold day: keep your ball in your pocket between shots. A cold ball loses far more distance than cold air."

/** A strokes difference as "+0.07" / "-0.07". */
const signed = (d: number) => `${d < 0 ? "-" : "+"}${Math.abs(d).toFixed(2)}`

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="text-muted">{label}</span> <span className="text-fg-2">{children}</span>
    </p>
  )
}

export interface DetailsPanelProps {
  open: boolean
  /** The group to bring into view when the panel opens. */
  section: DetailsSection
  onClose: () => void
  // Conditions
  wind: WindState
  holeBearingDeg: number | null
  playsLikeOn: boolean
  onPlaysLikeChange: (on: boolean) => void
  hasElevation: boolean
  /** The plays-like adjustments as shown ("+7 uphill, -9 wind, +3 cold"); null when none applies. */
  breakdown: string | null
  coldTip: boolean
  // Map
  hole: CourseHole | null
  holeQuality: HoleDataQuality | null
  geometry: CourseGeometry | null
  onEditHole: () => void
  onStartDraw: (lie: Lie) => void
  onConfirmHazard: (hazard: ConfirmableHazard, value: boolean) => void
  // How it's scored
  best: OptimizedClubPlan
  chosen: OptimizedClubPlan
  chosenLive: ClubPlan
  options: (Options<OptimizedClubPlan> & { tradeoff: string | null }) | null
  atBestAim: boolean
  chosenAtAim: number | null
  /** Where the ball lies: "the fairway", "the tee". */
  fromLabel: string
  baselineHandicap: number | null
  shotsLabel?: string
  avgLeft: number | null
  estimateNotes: Record<string, string>
  onCourseSpread: number
  /** The round screen: a bottom sheet at every width (otherwise it sits inline from tablet up). */
  sheet?: boolean
}

export function DetailsPanel(p: DetailsPanelProps) {
  const refs = { conditions: useRef<HTMLElement>(null), map: useRef<HTMLElement>(null), scoring: useRef<HTMLElement>(null) }
  const { open, section } = p
  useEffect(() => {
    // Only the copy that is on screen moves (the page holds one for phones and one for wider screens).
    const el = refs[section].current
    if (open && el && el.offsetParent !== null) el.scrollIntoView({ block: "start" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section])
  if (!open) return null

  const { chosen, best, chosenLive, options, holeQuality, geometry, hole } = p
  const other = otherOption(options, chosen, best)
  const gap = other ? chosen.plan.expectedStrokes - other.plan.expectedStrokes : 0
  const carry = Math.round(chosenLive.meanCarryYds)
  const finish = Math.round(chosenLive.meanTotalYds)
  const heading = "mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted"
  const { onStartDraw, onConfirmHazard } = p

  return (
    <>
      <button type="button" aria-label="Close details" onClick={p.onClose} className={`fixed inset-0 z-[1240] bg-black/40 ${p.sheet ? "" : "md:hidden"}`} />
      <div
        role="dialog"
        aria-label="Details"
        className={`fixed inset-x-0 bottom-0 z-[1250] max-h-[80dvh] space-y-4 overflow-y-auto rounded-t-2xl border border-b-0 border-fg/[0.1] bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 text-xs ${
          p.sheet ? "" : "md:static md:z-auto md:max-h-none md:overflow-visible md:rounded-2xl md:border-b md:px-4 md:pb-3"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-fg">Details</p>
          <button type="button" onClick={p.onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center text-fg-3 md:h-9 md:w-9">
            <X size={18} />
          </button>
        </div>

        <section ref={refs.conditions}>
          <p className={heading}>Conditions</p>
          <WindControl
            wind={p.wind}
            holeBearingDeg={p.holeBearingDeg}
            playsLikeOn={p.playsLikeOn}
            onPlaysLikeChange={p.onPlaysLikeChange}
            hasElevation={p.hasElevation}
            breakdown={p.breakdown}
          />
          {p.coldTip && <p className="mt-1 text-fg-3">{COLD_BALL_TIP}</p>}
        </section>

        <section ref={refs.map} className="space-y-1.5">
          <p className={heading}>Map</p>
          <p className="text-fg-3">
            From {p.fromLabel}
            {hole && !!hole.correctedFields?.length && <span title={`Corrected: ${hole.correctedFields.join(", ")}`}> · corrected</span>}
            {hole && (
              <>
                {" · "}
                <button onClick={p.onEditHole} className="font-semibold text-accent hover:underline">
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
        </section>

        <section ref={refs.scoring} className="space-y-1">
          <p className={heading}>How it&rsquo;s scored</p>
          <Row label="Expected strokes">{chosen.plan.expectedStrokes.toFixed(1)}</Row>
          {other && (
            <Row label={`vs ${other.club}`}>
              {signed(gap)}
              {(gap >= 0 ? isTie(chosen.plan, other.plan) : isTie(other.plan, chosen.plan)) ? " (a tie, within the noise)" : ""}
            </Row>
          )}
          {!p.atBestAim && p.chosenAtAim != null && <Row label="At your aim">{signed(p.chosenAtAim - chosen.plan.expectedStrokes)}</Row>}
          <Row label="Lie">{p.fromLabel}</Row>
          <Row label="Scored against">{p.baselineHandicap == null ? "PGA TOUR" : `a ${p.baselineHandicap.toFixed(1)} handicap`}</Row>
          {p.shotsLabel && <Row label="Shots">{p.shotsLabel}</Row>}
          <Row label={Math.abs(finish - carry) >= CARRY_FINISH_DIFFER_YDS ? "Carry / finish" : "Carry"}>
            {Math.abs(finish - carry) >= CARRY_FINISH_DIFFER_YDS ? `${carry} / ${finish} yd` : `${carry} yd`}
            {p.avgLeft != null && `, leaves ${Math.round(p.avgLeft)} yd`}
          </Row>
          {p.estimateNotes[chosen.club] && <p className="text-fg-3">{p.estimateNotes[chosen.club]}.</p>}
          {options?.tradeoff && <p className="text-fg-2">{options.tradeoff}</p>}
          <div className="pt-2">
            <ScoringDetails baselineHandicap={p.baselineHandicap} onCourseSpread={p.onCourseSpread} />
          </div>
        </section>
      </div>
    </>
  )
}
