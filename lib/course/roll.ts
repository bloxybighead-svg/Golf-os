// Rollout: how far a shot runs after it lands. Shots are judged where they
// stop, not where they land -- a 264-yd driver carry finishes well past 264
// on a fairway.
//
// Only the tee clubs roll: Driver and 3-Wood. Every other club -- 5/7-wood,
// hybrids, irons, wedges -- is scored where it lands (the author, 2026-09-30:
// "my 7 iron does not roll at all"). Their few yards of release are within
// the carry spread anyway.
//
// The roll numbers are ESTIMATES, not measured for this app or this golfer:
// round figures for typical amateur rollout on a firm-ish fairway, scaled
// down by how much the landing lie grabs the ball. There is no launch-monitor
// roll data behind them (carry is what the monitor measures). Swap them for
// measured values if the app ever records where shots finish.

import { landingPoint, type LatLng } from "./geo"
import type { Lie, LieMap } from "./lies"

export type ClubGroup = "driver" | "threeWood" | "noRoll"

/** Estimated rollout on fairway, yards, by club group. */
export const BASE_ROLL_YDS: Record<ClubGroup, number> = {
  driver: 20,
  threeWood: 12,
  noRoll: 0, // everything else: scored where it lands
}

/**
 * Share of the fairway rollout kept after landing on each lie (estimates).
 * Bunkers, water and out of bounds keep the ball where it lands; rough and
 * trees kill most of the run. A driver or 3-wood that lands on a green runs
 * on (it doesn't check up).
 */
export const LIE_ROLL_FACTOR: Record<Lie, number> = {
  fairway: 1,
  green: 1,
  rough: 0.3,
  trees: 0.2,
  bunker: 0,
  water: 0,
  oob: 0,
}

/** How much each shot's roll varies around the estimate: +-30%. */
export const ROLL_SPREAD = 0.3

/** A mishit that barely carries doesn't run for miles: roll never exceeds this share of the carry. */
export const MAX_ROLL_SHARE_OF_CARRY = 0.25

/** Lies the ball stops in if it rolls into them. */
const STOPS_ROLL: readonly Lie[] = ["bunker", "water", "oob"]

/** How often the path is checked while the ball rolls, yards. */
const PATH_STEP_YDS = 2

/** The club's roll group from its name: "Driver", "3-Wood" (or "3W"), and everything else. */
export function clubGroup(club: string): ClubGroup {
  const c = club.toLowerCase()
  if (c.includes("driver")) return "driver"
  if (/\b3\s*-?\s*w(ood)?\b/.test(c)) return "threeWood"
  return "noRoll"
}

/**
 * Roll distance along the shot line for one shot, before any hazard on the
 * way stops it (see `rollToRest`). `rng` gives the shot-to-shot spread;
 * pass the seeded generator so results repeat. It's drawn for every shot,
 * rolling or not, so each shot keeps the same draw whatever it lands on.
 */
export function rollYds(club: string, landingLie: Lie, carryYds: number, rng: () => number, rollScale = 1): number {
  const spread = 1 + ROLL_SPREAD * (2 * rng() - 1)
  // rollScale: wind and slope (playsLike.ts); 1 = still air, level ground.
  const roll = BASE_ROLL_YDS[clubGroup(club)] * LIE_ROLL_FACTOR[landingLie] * spread * rollScale
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
