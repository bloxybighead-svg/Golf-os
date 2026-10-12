// The golfer's on-course spread, measured from the shots they recorded.
//
// The planner widens each club's offline spread by one number (the on-course
// spread, 1.0-1.5x: lib/course/strategy.ts). Recorded shots say how wide the
// golfer's misses really are: each shot's lateral miss is how far its finish
// is to the side of the line from where it started to the pin (aiming at the
// pin is assumed; a steady aim offset drops out because the spread is taken
// about the group's own mean). That miss is divided by what the planner's own
// shots for that club spread at that distance, so 1.32 means "1.32x wider
// than the planner's model", the same thing the slider scales.
//
// Judged per club group, and only once a group has MIN_GROUP_SHOTS.

import { toLocal, type LatLng } from "@/lib/course/geo"
import type { Club } from "@/lib/golfer/tables"
import { PUTTER, type RoundShot } from "./shots"

/** A club group needs this many shots before it says anything. From the spec. */
export const MIN_GROUP_SHOTS = 20

export type ClubGroup = "woods" | "long_irons" | "short_irons" | "wedges"

const CLUB_GROUPS: readonly { group: ClubGroup; label: string; clubs: readonly Club[] }[] = [
  { group: "woods", label: "Driver and woods", clubs: ["Driver", "3-Wood", "5-Wood", "7-Wood"] },
  { group: "long_irons", label: "Long irons", clubs: ["4-Iron", "5-Iron", "6-Iron"] },
  { group: "short_irons", label: "Short irons", clubs: ["7-Iron", "8-Iron", "9-Iron"] },
  { group: "wedges", label: "Wedges", clubs: ["PW", "GW", "SW", "LW"] },
]

/** The group a club is in; null for a putter or a partial swing ("SW 3/4"). */
export function clubGroup(club: string): ClubGroup | null {
  return CLUB_GROUPS.find((g) => (g.clubs as readonly string[]).includes(club))?.group ?? null
}

export interface LateralSample {
  club: string
  /** How far the shot went, yards. */
  distYds: number
  /** Yards right (+) or left (-) of the line to the pin. */
  lateralYds: number
}

/**
 * Full-swing shots with a tracked start and finish, one round's shots at a time (the pin is where the hole was
 * holed). A shot that took a penalty or finished in water or out of bounds is left out: its recorded finish is
 * where the ball was dropped, not where it went.
 */
export function lateralSamples(rounds: readonly (readonly RoundShot[])[]): LateralSample[] {
  const out: LateralSample[] = []
  for (const shots of rounds) {
    for (const hole of new Set(shots.map((s) => s.holeNumber))) {
      const here = shots.filter((s) => s.holeNumber === hole)
      const pin: LatLng | null = here.find((s) => s.toLie === "holed")?.to ?? null
      if (!pin) continue
      for (const s of here) {
        if (s.club === PUTTER || !clubGroup(s.club) || !s.from || !s.to) continue
        if (s.penaltyStrokes > 0 || s.toLie === "water" || s.toLie === "oob") continue
        const line = toLocal(s.from, pin)
        const end = toLocal(s.from, s.to)
        const lineLen = Math.hypot(line.x, line.y)
        if (lineLen === 0) continue
        out.push({ club: s.club, distYds: Math.hypot(end.x, end.y), lateralYds: (end.x * line.y - end.y * line.x) / lineLen })
      }
    }
  }
  return out
}

export interface ModelSpread {
  /** The planner's mean carry for the club, yards. */
  meanCarryYds: number
  /** The standard deviation of its offline, yards, at that carry. */
  offlineSdYds: number
}

const sd = (xs: readonly number[]) => {
  const m = xs.reduce((a, x) => a + x, 0) / xs.length
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length)
}

/** The planner's own spread for each club, from the shots it plays with. Lateral spread grows in proportion to distance. */
export function modelSpread(clubs: readonly { club: string; shots: readonly { carryYds: number; offlineYds: number }[] }[]): Map<string, ModelSpread> {
  const out = new Map<string, ModelSpread>()
  for (const c of clubs) {
    if (c.shots.length < 2) continue
    const meanCarryYds = c.shots.reduce((a, s) => a + s.carryYds, 0) / c.shots.length
    const offlineSdYds = sd(c.shots.map((s) => s.offlineYds))
    if (meanCarryYds > 0 && offlineSdYds > 0) out.set(c.club, { meanCarryYds, offlineSdYds })
  }
  return out
}

export interface GroupSpread {
  group: ClubGroup
  label: string
  /** How many times wider than the planner's model. */
  ratio: number
  shots: number
}

export interface SpreadSuggestion {
  /** All qualifying groups pooled. */
  ratio: number
  shots: number
  groups: GroupSpread[]
}

/** The spread to suggest, or null while no club group has MIN_GROUP_SHOTS. Groups below it are left out. */
export function suggestSpread(samples: readonly LateralSample[], model: ReadonlyMap<string, ModelSpread>): SpreadSuggestion | null {
  const groups: GroupSpread[] = []
  let squares = 0
  let degrees = 0
  for (const { group, label } of CLUB_GROUPS) {
    // Each shot's miss in units of the planner's spread for that club at that distance.
    const z = samples.flatMap((s) => {
      const m = clubGroup(s.club) === group ? model.get(s.club) : undefined
      return m ? [s.lateralYds / (m.offlineSdYds * (s.distYds / m.meanCarryYds))] : []
    })
    if (z.length < MIN_GROUP_SHOTS) continue
    const mean = z.reduce((a, x) => a + x, 0) / z.length
    const ss = z.reduce((a, x) => a + (x - mean) ** 2, 0)
    groups.push({ group, label, ratio: Math.sqrt(ss / (z.length - 1)), shots: z.length })
    squares += ss
    degrees += z.length - 1
  }
  if (groups.length === 0) return null
  return { ratio: Math.sqrt(squares / degrees), shots: groups.reduce((n, g) => n + g.shots, 0), groups }
}
