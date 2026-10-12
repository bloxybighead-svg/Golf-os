// Shots recorded during a round (round_shots): where the ball was, where it
// went, with which club. Swing shots are recorded on Play as the ball moves
// after a club was picked; the putts come from the hole's score at save time.
// A putt's distance is unknown except the first, which runs from where the
// approach finished to the pin.

import { distanceYds, type LatLng } from "@/lib/course/geo"
import type { Lie } from "@/lib/course/lies"
import { NEW_SHOT_YDS, choiceClub, type ClubChoice } from "@/lib/planner/clubChoice"

export type ShotLie = Lie | "tee" | "holed"

/** The lies a golfer can correct a shot's finish to. */
export const EDITABLE_LIES: readonly Lie[] = ["fairway", "rough", "bunker", "green", "trees", "water", "oob"]

export const PUTTER = "Putter"

/** The most penalty strokes a single shot can carry (water or OB, plus an unplayable). An estimate. */
export const MAX_PENALTY_STROKES = 2

export interface RoundShot {
  holeNumber: number
  /** 1-based within the hole, in the order played. Penalty strokes do not take a number. */
  shotNumber: number
  club: string
  from: LatLng | null
  fromLie: ShotLie
  to: LatLng | null
  toLie: ShotLie
  penaltyStrokes: number
}

/** A swing shot as kept on the device: it also remembers the pin, to place the putts that follow. */
export interface SwingShot extends RoundShot {
  from: LatLng
  to: LatLng
  pin: LatLng
}

/** A move of the ball counts as a shot only with a club picked and a real walk: GPS jitter and nudges are well under NEW_SHOT_YDS. */
function isShotMove(choice: ClubChoice, from: LatLng | null, to: LatLng): boolean {
  return choice !== "auto" && !!from && distanceYds(from, to) >= NEW_SHOT_YDS
}

export interface BallMove {
  holeNumber: number
  choice: ClubChoice
  from: LatLng | null
  fromLie: ShotLie
  to: LatLng
  toLie: ShotLie
  pin: LatLng
  /** The move is a GPS fix while following: the golfer may still be walking to the ball. */
  following: boolean
}

/**
 * What the ball moving does to the shots: a picked club and a real walk records
 * a shot. Otherwise, while following GPS, the last shot's finish keeps moving
 * with the golfer until they pick the next club (a fix 30 yd into the walk is
 * not where the ball ended). Any other move changes nothing.
 */
export function trackBallMove(shots: readonly SwingShot[], m: BallMove): SwingShot[] {
  if (m.from && isShotMove(m.choice, m.from, m.to)) return recordShot(shots, { ...m, from: m.from })
  const last = lastShotOn(shots, m.holeNumber)
  if (m.following && last && (m.choice === "auto" || choiceClub(m.choice) === last.club)) {
    return shots.map((s) => (s === last ? { ...s, to: m.to, toLie: m.toLie } : s))
  }
  return [...shots]
}

const swingShotsOn = (shots: readonly SwingShot[], holeNumber: number) => shots.filter((s) => s.holeNumber === holeNumber)

export function lastShotOn(shots: readonly SwingShot[], holeNumber: number): SwingShot | null {
  const here = swingShotsOn(shots, holeNumber)
  return here.length > 0 ? here[here.length - 1] : null
}

/**
 * Adds the shot the ball just made. It starts in the lie the golfer last
 * confirmed for the previous shot (their correction carries over), unless that
 * was water or out of bounds: nobody plays from there, so the lie the ball was
 * dropped in stands.
 */
function recordShot(
  shots: readonly SwingShot[],
  move: { holeNumber: number; choice: ClubChoice; from: LatLng; fromLie: ShotLie; to: LatLng; toLie: ShotLie; pin: LatLng }
): SwingShot[] {
  const previous = lastShotOn(shots, move.holeNumber)
  return [
    ...shots,
    {
      holeNumber: move.holeNumber,
      shotNumber: (previous?.shotNumber ?? 0) + 1,
      club: choiceClub(move.choice),
      from: move.from,
      fromLie: previous && previous.toLie !== "water" && previous.toLie !== "oob" ? previous.toLie : move.fromLie,
      to: move.to,
      toLie: move.toLie,
      penaltyStrokes: 0,
      pin: move.pin,
    },
  ]
}

/** Corrects the last shot on a hole: its club, where it finished, or its penalty strokes. */
export function editLastShot(
  shots: readonly SwingShot[],
  holeNumber: number,
  patch: Partial<Pick<SwingShot, "club" | "toLie" | "penaltyStrokes">>
): SwingShot[] {
  const last = lastShotOn(shots, holeNumber)
  if (!last) return [...shots]
  const penaltyStrokes = patch.penaltyStrokes == null ? last.penaltyStrokes : Math.max(0, Math.min(MAX_PENALTY_STROKES, Math.round(patch.penaltyStrokes)))
  return shots.map((s) => (s === last ? { ...s, ...patch, penaltyStrokes } : s))
}

/** How a lie reads on screen. */
export const lieLabel = (lie: ShotLie): string => (lie === "oob" ? "OB" : lie)

/** "7-Iron, fairway, 162 yd". */
export function describeShot(s: RoundShot): string {
  const yd = s.from && s.to ? `, ${Math.round(distanceYds(s.from, s.to))} yd` : ""
  return `${s.club}, ${lieLabel(s.toLie)}${yd}`
}

/**
 * The shots to save for a round: each hole's swing shots, then its putts. A
 * putt is a shot with no distance except the first, which runs from the last
 * swing shot's finish to the pin; the last putt ends at the pin, holed. A hole
 * with no putt count, or no swing shot to place them from, keeps only its swings.
 */
export function shotsToSave(swings: readonly SwingShot[], puttsByHole: ReadonlyMap<number, number | null>): RoundShot[] {
  const out: RoundShot[] = []
  const holes = [...new Set(swings.map((s) => s.holeNumber))].sort((a, b) => a - b)
  for (const holeNumber of holes) {
    const here = swingShotsOn(swings, holeNumber)
    for (const { pin: _pin, ...swing } of here) out.push(swing)
    const last = here[here.length - 1]
    const putts = puttsByHole.get(holeNumber) ?? 0
    for (let i = 0; i < putts; i++) {
      out.push({
        holeNumber,
        shotNumber: last.shotNumber + 1 + i,
        club: PUTTER,
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

/** One row of round_shots. */
export function toDbRow(roundId: string, userId: string, s: RoundShot) {
  return {
    round_id: roundId,
    user_id: userId,
    hole_number: s.holeNumber,
    shot_number: s.shotNumber,
    club: s.club,
    from_lat: s.from?.lat ?? null,
    from_lng: s.from?.lng ?? null,
    from_lie: s.fromLie,
    to_lat: s.to?.lat ?? null,
    to_lng: s.to?.lng ?? null,
    to_lie: s.toLie,
    penalty_strokes: s.penaltyStrokes,
  }
}
