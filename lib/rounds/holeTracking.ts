// What "Hole done" does with the shots recorded on a hole: do they add up to
// the score, what to ask when they do not, where the last swing finished, and
// the rows to save. Putts are never tapped; they follow from the score.
//
//   unaccounted = score - swing shots recorded - putts - penalty strokes
//
//   0     the last swing finished on the green (whatever the marker said)
//   1, 2  shots went unrecorded before putting: chips, or missed swings
//   < 0   more shots recorded than the score allows
//
// Saving the score is never blocked: a hole that does not add up is saved as
// "partial" and its strokes gained comes from the scorecard.

import { fromLocal, toLocal, type LatLng } from "@/lib/course/geo"
import type { PenaltyShot } from "./holes"
import { CHIP, PUTTER, swingShotsOn, type RoundShot, type ShotLie, type SwingShot } from "./shots"

export type HoleTracking = "complete" | "partial" | "none"

/** The quick answers for the first putt, feet; the last is "40+". */
export const FIRST_PUTT_CHOICES_FT: readonly number[] = [3, 8, 15, 25, 40]

/** A manually typed first putt must be a distance a putt can be. */
export const MAX_FIRST_PUTT_FT = 150

export interface HoleCounts {
  strokes: number
  putts: number | null
  penalty: boolean
  penaltyShot: PenaltyShot | null
}

/** Where the ball is as "Hole done" is tapped: the GPS fix when following, else the marker, and the lie under it. */
export interface BallNow {
  at: LatLng
  lie: ShotLie
}

/** Penalty strokes on the hole: those on the shots, and at least the one the golfer ticked on the hole. */
function penaltyStrokesOn(swings: readonly SwingShot[], hole: Pick<HoleCounts, "penalty">): number {
  return Math.max(
    swings.reduce((n, s) => n + s.penaltyStrokes, 0),
    hole.penalty ? 1 : 0
  )
}

/** Strokes the shots do not account for, or null when the hole has no putts entry to reconcile against. */
export function unaccountedOn(shots: readonly SwingShot[], holeNumber: number, hole: HoleCounts): number | null {
  if (hole.putts == null) return null
  const swings = swingShotsOn(shots, holeNumber)
  return hole.strokes - swings.length - hole.putts - penaltyStrokesOn(swings, hole)
}

export type HoleQuestion = { kind: "none" } | { kind: "missing"; count: 1 | 2 } | { kind: "excess" }

/** What "Hole done" should ask: nothing when the shots add up, or when none were recorded on the hole at all. */
export function questionFor(unaccounted: number | null, swingCount: number): HoleQuestion {
  if (unaccounted == null || swingCount === 0 || unaccounted === 0) return { kind: "none" }
  if (unaccounted < 0) return { kind: "excess" }
  return unaccounted <= 2 ? { kind: "missing", count: unaccounted as 1 | 2 } : { kind: "none" }
}

/** The point `feet` short of the pin on the line from `from`. */
export function placeShortOfPin(from: LatLng, pin: LatLng, feet: number): LatLng {
  const v = toLocal(pin, from)
  const len = Math.hypot(v.x, v.y)
  if (len === 0) return pin
  const yds = feet / 3
  return fromLocal(pin, { x: (v.x / len) * yds, y: (v.y / len) * yds })
}

const replace = (shots: readonly SwingShot[], target: SwingShot, next: SwingShot): SwingShot[] => shots.map((s) => (s === target ? next : s))

/**
 * The golfer says N shots went unrecorded between the last swing and the
 * green and they were chips: N greenside shots of unknown club from where the
 * last swing finished (the ball, if that swing has not been finished yet).
 */
export function addChips(shots: readonly SwingShot[], holeNumber: number, count: number, ball: BallNow): SwingShot[] {
  const here = swingShotsOn(shots, holeNumber)
  const last = here[here.length - 1]
  if (!last || count < 1) return [...shots]
  const at = last.to ?? ball.at
  const lie = last.to ? last.toLie : last.finishLieSet ? last.toLie : ball.lie
  let out = replace(shots, last, { ...last, to: at, toLie: lie })
  for (let i = 0; i < count; i++) {
    out = [
      ...out,
      {
        holeNumber,
        shotNumber: last.shotNumber + 1 + i,
        club: CHIP,
        clubConfirmed: false,
        from: at,
        fromLie: lie === "water" || lie === "oob" ? ball.lie : lie,
        to: null,
        toLie: lie,
        penaltyStrokes: 0,
        pin: last.pin,
      },
    ]
  }
  return out
}

/** A ticked penalty with no penalty stroke on any shot goes on the shot it names: the tee shot, else the last one. */
function assignPenalty(shots: readonly SwingShot[], holeNumber: number, hole: HoleCounts): SwingShot[] {
  const swings = swingShotsOn(shots, holeNumber)
  if (!hole.penalty || swings.length === 0 || swings.some((s) => s.penaltyStrokes > 0)) return [...shots]
  const target = hole.penaltyShot === "tee" ? swings[0] : swings[swings.length - 1]
  return replace(shots, target, { ...target, penaltyStrokes: 1 })
}

export interface HoleFinish {
  shots: SwingShot[]
  tracking: HoleTracking
  unaccounted: number | null
}

/**
 * Closes a hole's tracking when the golfer taps "Hole done": a ticked penalty
 * lands on a shot, and when the shots add up the last swing is finished.
 *  - holed, with no putts: it ends at the pin;
 *  - otherwise it ends on the green, the first putt's distance short of the pin
 *    if the golfer gave one, else where the ball is when that is on the green,
 *    else unknown (the first putt is then estimated).
 * `ball` is null when the hole is no longer the one on the map.
 */
export function finishHole(
  shots: readonly SwingShot[],
  holeNumber: number,
  hole: HoleCounts,
  firstPuttFt: number | null,
  ball: BallNow | null
): HoleFinish {
  const withPenalty = assignPenalty(shots, holeNumber, hole)
  const swings = swingShotsOn(withPenalty, holeNumber)
  if (swings.length === 0) return { shots: withPenalty, tracking: "none", unaccounted: null }

  const unaccounted = unaccountedOn(withPenalty, holeNumber, hole)
  const last = swings[swings.length - 1]
  let finished: SwingShot = last
  if (unaccounted === 0 && hole.putts === 0) {
    finished = { ...last, to: last.pin, toLie: "holed" }
  } else if (unaccounted === 0) {
    const to =
      firstPuttFt != null ? placeShortOfPin(last.from, last.pin, firstPuttFt) : ball?.lie === "green" ? ball.at : last.toLie === "green" ? last.to : null
    finished = { ...last, to, toLie: "green" }
  } else if (last.to == null && ball) {
    finished = { ...last, to: ball.at, toLie: last.finishLieSet ? last.toLie : ball.lie }
  }
  return {
    shots: replace(withPenalty, last, finished),
    tracking: unaccounted === 0 ? "complete" : "partial",
    unaccounted,
  }
}

/** How many holes are tracked completely, and how many have any shot. */
export function trackedHoleCounts(holes: readonly { tracking?: HoleTracking | null }[]): { complete: number; any: number } {
  return {
    complete: holes.filter((h) => h.tracking === "complete").length,
    any: holes.filter((h) => h.tracking === "complete" || h.tracking === "partial").length,
  }
}

export interface SaveHole {
  holeNumber: number
  putts: number | null
}

/**
 * The shots to save for a round: each hole's swing shots in order, then its
 * putts. Putts follow only a swing that finished on the green: the first runs
 * from that finish (unknown distance when unknown) to the pin, the rest have no
 * positions, and the last ends holed. A ball that is not on the green never
 * gets a putt placed.
 */
export function shotsToSave(swings: readonly SwingShot[], holes: readonly SaveHole[]): RoundShot[] {
  const out: RoundShot[] = []
  const puttsByHole = new Map(holes.map((h) => [h.holeNumber, h.putts ?? 0]))
  const numbers = [...new Set(swings.map((s) => s.holeNumber))].sort((a, b) => a - b)
  for (const holeNumber of numbers) {
    const here = swingShotsOn(swings, holeNumber)
    for (const { pin: _pin, finishLieSet: _set, ...swing } of here) out.push(swing)
    const last = here[here.length - 1]
    const putts = puttsByHole.get(holeNumber) ?? 0
    if (last.toLie !== "green") continue
    for (let i = 0; i < putts; i++) {
      out.push({
        holeNumber,
        shotNumber: last.shotNumber + 1 + i,
        club: PUTTER,
        clubConfirmed: false,
        from: i === 0 ? last.to : null,
        fromLie: "green",
        to: i === putts - 1 ? last.pin : null,
        toLie: i === putts - 1 ? "holed" : "green",
        penaltyStrokes: 0,
      })
    }
  }
  return out
}
