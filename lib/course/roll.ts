// Rollout: how far a shot runs after it lands. Shots are judged where they
// stop, not where they land -- a 264-yd driver carry finishes well past 264
// on a fairway, and a wedge that lands on the green barely moves.
//
// Every number here is an ESTIMATE, not measured for this app or this
// golfer: round figures for typical amateur rollout on a firm-ish fairway,
// scaled down by how much the landing lie grabs the ball. There is no
// launch-monitor roll data behind them (carry is what the monitor measures).
// Swap them for measured values if the app ever records where shots finish.

import { landingPoint, type LatLng } from "./geo"
import type { Lie, LieMap } from "./lies"

export type ClubGroup = "driver" | "wood" | "longIron" | "midIron" | "shortIron" | "wedge"

/** Estimated rollout on fairway, yards, by club group. */
export const BASE_ROLL_YDS: Record<ClubGroup, number> = {
  driver: 20,
  wood: 12, // fairway woods and hybrids
  longIron: 8, // 3-5 iron
  midIron: 5, // 6-7 iron
  shortIron: 3, // 8-9 iron
  wedge: 1,
}

/**
 * Share of the fairway rollout kept after landing on each lie (estimates).
 * Bunkers, water and out of bounds keep the ball where it lands; rough and
 * trees kill most of the run. The green is handled separately: irons and
 * wedges check up (half), woods don't.
 */
export const LIE_ROLL_FACTOR: Record<Exclude<Lie, "green">, number> = {
  fairway: 1,
  rough: 0.3,
  trees: 0.2,
  bunker: 0,
  water: 0,
  oob: 0,
}
export const GREEN_ROLL_FACTOR_CHECKING = 0.5 // irons and wedges
export const GREEN_ROLL_FACTOR_RUNNING = 1 // driver and woods

/** How much each shot's roll varies around the estimate: +-30%. */
export const ROLL_SPREAD = 0.3

/** A mishit that barely carries doesn't run for miles: roll never exceeds this share of the carry. */
export const MAX_ROLL_SHARE_OF_CARRY = 0.25

/** Lies the ball stops in if it rolls into them. */
const STOPS_ROLL: readonly Lie[] = ["bunker", "water", "oob"]

/** How often the path is checked while the ball rolls, yards. */
const PATH_STEP_YDS = 2

/** The club's roll group from its name ("Driver", "3-Wood", "7-Iron", "PW", "56 (SW)", "4 Hybrid"...). */
export function clubGroup(club: string): ClubGroup {
  const c = club.toLowerCase()
  if (c.includes("driver")) return "driver"
  if (c.includes("wood") || c.includes("hybrid") || /\b\d+w\b/.test(c)) return "wood"
  if (/\b(pw|gw|sw|lw|aw|wedge)\b/.test(c) || /^\d{2}\b/.test(c)) return "wedge"
  const iron = c.match(/\b(\d)\s*-?\s*i(ron)?\b/)
  if (iron) {
    const n = Number(iron[1])
    return n <= 5 ? "longIron" : n <= 7 ? "midIron" : "shortIron"
  }
  return "midIron"
}

/**
 * Roll distance along the shot line for one shot, before any hazard on the
 * way stops it (see `rollToRest`). `rng` gives the shot-to-shot spread;
 * pass the seeded generator so results repeat.
 */
export function rollYds(club: string, landingLie: Lie, carryYds: number, rng: () => number): number {
  const group = clubGroup(club)
  const factor =
    landingLie === "green"
      ? group === "driver" || group === "wood"
        ? GREEN_ROLL_FACTOR_RUNNING
        : GREEN_ROLL_FACTOR_CHECKING
      : LIE_ROLL_FACTOR[landingLie]
  const spread = 1 + ROLL_SPREAD * (2 * rng() - 1)
  const roll = BASE_ROLL_YDS[group] * factor * spread
  return Math.max(0, Math.min(roll, Math.max(0, carryYds) * MAX_ROLL_SHARE_OF_CARRY))
}

export interface Rest {
  point: LatLng
  lie: Lie
  /** How far it actually rolled: less than asked when a hazard stopped it. */
  rolledYds: number
}

/**
 * Rolls the ball `roll` yards from where it landed along `bearing`, checking
 * the lie every 2 yards: rolling into a bunker, water or out of bounds stops
 * it there. Otherwise it finishes the full roll.
 */
export function rollToRest(landing: LatLng, landingLie: Lie, bearing: number, roll: number, lies: LieMap): Rest {
  if (roll <= 0 || STOPS_ROLL.includes(landingLie)) return { point: landing, lie: landingLie, rolledYds: 0 }
  for (let d = Math.min(PATH_STEP_YDS, roll); ; d = Math.min(d + PATH_STEP_YDS, roll)) {
    const p = landingPoint(landing, bearing, d, 0)
    const lie = lies.lieAt(p)
    if (STOPS_ROLL.includes(lie) || d >= roll) return { point: p, lie, rolledYds: d }
  }
}
