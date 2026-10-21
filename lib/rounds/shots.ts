// Shots recorded during a round (round_shots): where the ball was, where it
// went, with which club. Recording is explicit: the golfer taps "Shot" and the
// shot starts at the ball's position, with the club on screen. It finishes where
// the next one starts, or at "Hole done". The ball moving (GPS or a drag) never
// makes a shot. Putts are never tapped: they come from the hole's score at save
// time, and only after a swing that finished on the green.

import { distanceYds, fromLocal, toLocal, type LatLng } from "@/lib/course/geo"
import type { Lie } from "@/lib/course/lies"

export type ShotLie = Lie | "tee" | "holed"

/** The lies a golfer can correct a shot's finish to. */
export const EDITABLE_LIES: readonly Lie[] = ["fairway", "rough", "bunker", "green", "trees", "water", "oob"]

export const PUTTER = "Putter"
/** A greenside shot the golfer said happened but whose club is unknown. */
export const CHIP = "Chip"
/** A shot added to fill a gap: nobody knows the club yet. */
export const UNKNOWN_CLUB = "Unknown"

/** The most penalty strokes a single shot can carry (water or OB, plus an unplayable). An estimate. */
export const MAX_PENALTY_STROKES = 2

/** A shot is called too long past this share of the club's mean total. ESTIMATE: from the spec; a good strike with a tailwind is within it. */
export const TOO_LONG_SHARE = 1.15

export interface RoundShot {
  holeNumber: number
  /** 1-based within the hole, in the order played. Penalty strokes do not take a number. */
  shotNumber: number
  club: string
  /** The golfer picked the club (true), rather than the app's suggestion standing (false). */
  clubConfirmed: boolean
  from: LatLng | null
  fromLie: ShotLie
  to: LatLng | null
  toLie: ShotLie
  penaltyStrokes: number
}

/**
 * A swing shot as kept on the device: it also remembers the pin, to place the putts that follow. `to` is null
 * until the shot finishes; `finishLieSet` says the golfer chose the finish lie, so the ball's position does not overwrite it.
 */
export interface SwingShot extends RoundShot {
  from: LatLng
  pin: LatLng
  finishLieSet?: boolean
}

export const swingShotsOn = (shots: readonly SwingShot[], holeNumber: number): SwingShot[] => shots.filter((s) => s.holeNumber === holeNumber)

export function lastShotOn(shots: readonly SwingShot[], holeNumber: number): SwingShot | null {
  const here = swingShotsOn(shots, holeNumber)
  return here.length > 0 ? here[here.length - 1] : null
}

/** Shots on a hole numbered 1..n in order, other holes untouched. */
function renumber(shots: readonly SwingShot[], holeNumber: number): SwingShot[] {
  let n = 0
  return shots.map((s) => (s.holeNumber === holeNumber ? { ...s, shotNumber: ++n } : s))
}

/** The lie the next shot starts in: the one the golfer confirmed for the last finish, unless nobody plays from there (water, OB). */
function playableLie(finish: ShotLie, found: ShotLie): ShotLie {
  return finish !== "water" && finish !== "oob" ? finish : found
}

export interface ShotTap {
  holeNumber: number
  club: string
  clubConfirmed: boolean
  /** The ball's position: GPS when following, else the ball marker. */
  at: LatLng
  atLie: ShotLie
  pin: LatLng
}

/**
 * The golfer tapped Shot: exactly one new shot, starting at the ball. The shot
 * before it on this hole finishes here, in the lie the ball is in (or the one
 * the golfer already set for that finish).
 */
export function recordShot(shots: readonly SwingShot[], tap: ShotTap): SwingShot[] {
  const here = swingShotsOn(shots, tap.holeNumber)
  const previous = here[here.length - 1]
  const finishLie = previous?.finishLieSet || previous?.to != null ? previous.toLie : tap.atLie
  const finished = previous && previous.to == null ? shots.map((s) => (s === previous ? { ...s, to: tap.at, toLie: finishLie } : s)) : [...shots]
  const startLie = previous ? playableLie(finishLie, tap.atLie) : tap.atLie
  return [
    ...finished,
    {
      holeNumber: tap.holeNumber,
      shotNumber: here.length + 1,
      club: tap.club,
      clubConfirmed: tap.clubConfirmed,
      from: tap.at,
      fromLie: startLie,
      to: null,
      toLie: tap.atLie,
      penaltyStrokes: 0,
      pin: tap.pin,
    },
  ]
}

/** Corrects one shot: its club (which makes it the golfer's own pick), where it finished, or its penalty strokes. */
export function editShot(
  shots: readonly SwingShot[],
  holeNumber: number,
  shotNumber: number,
  patch: Partial<Pick<SwingShot, "club" | "toLie" | "penaltyStrokes">>
): SwingShot[] {
  const here = swingShotsOn(shots, holeNumber)
  const target = here.find((s) => s.shotNumber === shotNumber)
  if (!target) return [...shots]
  const penaltyStrokes = patch.penaltyStrokes == null ? target.penaltyStrokes : Math.max(0, Math.min(MAX_PENALTY_STROKES, Math.round(patch.penaltyStrokes)))
  const next = here[here.indexOf(target) + 1]
  return shots.map((s) => {
    if (s === target) {
      return { ...s, ...patch, penaltyStrokes, clubConfirmed: patch.club != null ? true : s.clubConfirmed, finishLieSet: patch.toLie != null ? true : s.finishLieSet }
    }
    // The golfer's correction of a finish carries over to where the next shot starts.
    if (s === next && patch.toLie != null) return { ...s, fromLie: playableLie(patch.toLie, s.fromLie) }
    return s
  })
}

/** Removes one shot; the one before it now finishes where the removed one did. */
export function deleteShot(shots: readonly SwingShot[], holeNumber: number, shotNumber: number): SwingShot[] {
  const here = swingShotsOn(shots, holeNumber)
  const target = here.find((s) => s.shotNumber === shotNumber)
  if (!target) return [...shots]
  const before = here[here.indexOf(target) - 1]
  const kept = shots
    .filter((s) => s !== target)
    .map((s) => (s === before ? { ...s, to: target.to, toLie: target.toLie } : s))
  return renumber(kept, holeNumber)
}

export const midpoint = (a: LatLng, b: LatLng): LatLng => {
  const p = toLocal(a, b)
  return fromLocal(a, { x: p.x / 2, y: p.y / 2 })
}

/**
 * "Missed a shot? Add one": splits a shot in two at the middle of its line. The
 * first now finishes at the midpoint, the new one (club unknown) runs from
 * there to where the original finished. `ball` is where an unfinished shot is
 * right now. The midpoint is meant to be dragged to where the ball really was.
 */
export function addShotAtMidpoint(
  shots: readonly SwingShot[],
  holeNumber: number,
  shotNumber: number,
  ball: LatLng,
  lieAt: (p: LatLng) => ShotLie
): SwingShot[] {
  const here = swingShotsOn(shots, holeNumber)
  const target = here.find((s) => s.shotNumber === shotNumber)
  if (!target) return [...shots]
  const end = target.to ?? ball
  const mid = midpoint(target.from, end)
  const midLie = lieAt(mid)
  const out: SwingShot[] = []
  for (const s of shots) {
    if (s !== target) {
      out.push(s)
      continue
    }
    out.push({ ...target, to: mid, toLie: midLie, penaltyStrokes: 0 })
    out.push({
      holeNumber,
      shotNumber: target.shotNumber + 1,
      club: UNKNOWN_CLUB,
      clubConfirmed: false,
      from: mid,
      fromLie: midLie,
      to: target.to,
      toLie: target.toLie,
      penaltyStrokes: target.penaltyStrokes,
      pin: target.pin,
    })
  }
  return renumber(out, holeNumber)
}

/** Drags the split point of an added shot: the first finishes there and the next starts there. */
export function moveSplit(shots: readonly SwingShot[], holeNumber: number, firstShotNumber: number, to: LatLng, lie: ShotLie): SwingShot[] {
  return shots.map((s) => {
    if (s.holeNumber !== holeNumber) return s
    if (s.shotNumber === firstShotNumber) return { ...s, to, toLie: lie }
    if (s.shotNumber === firstShotNumber + 1) return { ...s, from: to, fromLie: lie }
    return s
  })
}

/** How far a shot went: to where it finished, or to `ball` while it is still the last one. */
const shotYards = (s: Pick<RoundShot, "from" | "to">, ball: LatLng | null): number | null => {
  const end = s.to ?? ball
  return s.from && end ? distanceYds(s.from, end) : null
}

/** Whether a shot went further than its club can: past TOO_LONG_SHARE of the club's mean total in the bag. Clubs the bag does not know are never too long. */
export function isTooLong(s: Pick<RoundShot, "club" | "from" | "to">, ball: LatLng | null, totalByClub: ReadonlyMap<string, number>): boolean {
  const total = totalByClub.get(s.club)
  const yds = shotYards(s, ball)
  return total != null && yds != null && yds > total * TOO_LONG_SHARE
}

/** How a lie reads on screen. */
export const lieLabel = (lie: ShotLie): string => (lie === "oob" ? "OB" : lie)

/** A shot as the shot list reads it: "7-Iron, fairway, 162 yd". */
export function describeShot(s: Pick<RoundShot, "club" | "from" | "to" | "toLie">): string {
  const yd = s.from && s.to ? `, ${Math.round(distanceYds(s.from, s.to))} yd` : ""
  return `${s.club}, ${lieLabel(s.toLie)}${yd}`
}

/** One row of round_shots. */
export function toDbRow(roundId: string, userId: string, s: RoundShot) {
  return {
    round_id: roundId,
    user_id: userId,
    hole_number: s.holeNumber,
    shot_number: s.shotNumber,
    club: s.club,
    club_confirmed: s.clubConfirmed,
    from_lat: s.from?.lat ?? null,
    from_lng: s.from?.lng ?? null,
    from_lie: s.fromLie,
    to_lat: s.to?.lat ?? null,
    to_lng: s.to?.lng ?? null,
    to_lie: s.toLie,
    penalty_strokes: s.penaltyStrokes,
  }
}

/** A round_shots row as it comes back from Supabase. */
export interface RoundShotRow {
  hole_number: number
  shot_number: number
  club: string
  club_confirmed: boolean
  from_lat: number | null
  from_lng: number | null
  from_lie: ShotLie
  to_lat: number | null
  to_lng: number | null
  to_lie: ShotLie
  penalty_strokes: number
}

/** The columns to select to read a RoundShotRow back. */
export const ROUND_SHOT_COLUMNS = "hole_number, shot_number, club, club_confirmed, from_lat, from_lng, from_lie, to_lat, to_lng, to_lie, penalty_strokes"

const point = (lat: number | null, lng: number | null): LatLng | null => (lat != null && lng != null ? { lat, lng } : null)

export function fromDbRow(r: RoundShotRow): RoundShot {
  return {
    holeNumber: r.hole_number,
    shotNumber: r.shot_number,
    club: r.club,
    clubConfirmed: r.club_confirmed === true,
    from: point(r.from_lat, r.from_lng),
    fromLie: r.from_lie,
    to: point(r.to_lat, r.to_lng),
    toLie: r.to_lie,
    penaltyStrokes: r.penalty_strokes,
  }
}
