// One shot of look-ahead for the tee shot on long holes.
//
// The plain value of a spot is a table lookup: strokes to hole out from this
// lie at this distance. That table assumes the distance can be played, so a
// tee shot that leaves 330 yd to the pin on a par 5 is valued as if you could
// just hit it. Here every spot a tee shot can finish gets a value from the best
// NEXT shot instead: each club (a few samples, its own best aim among a few),
// played from that spot and scored with the same baseline, penalty cap and
// strategy rules as the tee shot itself. A tee shot is then worth the average
// grid value at its finish spots.
//
// The grid depends on the hole, pin, map, bag and strategy, not on where the
// ball is, so the worker builds it once per hole and reuses it.

import { bearingDeg, distanceYds, fromLocal, toLocal, type LatLng } from "./geo"
import { projectOnLine } from "./aim"
import type { Baseline } from "./baseline"
import type { Lie, LieMap } from "./lies"
import { evaluateClub, type ClubPlan, type ClubShots, type Landing } from "./plan"
import {
  LOOKAHEAD_AIM_OFFSETS,
  LOOKAHEAD_CELL_YDS,
  LOOKAHEAD_LATERAL_YDS,
  LOOKAHEAD_MAX_CELLS,
  LOOKAHEAD_MAX_CLUBS,
  LOOKAHEAD_MAX_TEE_FACTOR,
  LOOKAHEAD_MIN_TEE_YDS,
  LOOKAHEAD_SAMPLES,
  LOOKAHEAD_SEED,
  penaltyShare,
  pickPar,
  weighted,
  type Strategy,
} from "./strategy"
import { seededSample } from "@/lib/dispersion/stats"

export interface LookaheadArgs {
  /** The bag, already widened for Par mode where that applies. */
  clubs: ClubShots[]
  strategy: Strategy
  /** Where the tee shot is hit from (the grid is laid out in local yards around it). */
  from: LatLng
  pin: LatLng
  /** The hole's centreline: the grid covers LOOKAHEAD_LATERAL_YDS either side of it. */
  line: LatLng[]
  lies: LieMap
  baseline: Baseline
}

export interface Lookahead {
  /** Strokes still to play from where `l` stopped, valued by the best next shot; null where the grid has no opinion. */
  valueAt: (l: Landing) => number | null
  cells: number
}

const NO_OPINION: ReadonlySet<Lie> = new Set<Lie>(["water", "oob"])

interface Candidate {
  club: string
  carry: number
  shots: ClubShots
}

/** The best next shot from `at` (strokes to hole out, this shot included), or null with no clubs. */
export function bestNextShot(at: LatLng, lie: Lie, cands: Candidate[], args: LookaheadArgs): number | null {
  const d = distanceYds(at, args.pin)
  const nearest = [...cands].sort((a, b) => Math.abs(a.carry - d) - Math.abs(b.carry - d)).slice(0, LOOKAHEAD_MAX_CLUBS)
  const toPin = bearingDeg(at, args.pin)
  const plans = nearest.map((c) => {
    let best: ClubPlan | null = null
    for (const off of LOOKAHEAD_AIM_OFFSETS) {
      const bearing = (toPin + (Math.atan2(off, Math.max(c.carry, 10)) * 180) / Math.PI + 360) % 360
      const plan = evaluateClub(c.shots, { from: at, aim: args.pin, pin: args.pin, lies: args.lies, startLie: lie, baseline: args.baseline }, bearing)
      const score = args.strategy === "par" ? weighted({ strokes: plan.expectedStrokes, penalty: penaltyShare(plan) }) : plan.expectedStrokes
      const bestScore = best ? (args.strategy === "par" ? weighted({ strokes: best.expectedStrokes, penalty: penaltyShare(best) }) : best.expectedStrokes) : Infinity
      if (score < bestScore) best = plan
    }
    return best as ClubPlan
  })
  if (plans.length === 0) return null
  if (args.strategy === "go") return Math.min(...plans.map((p) => p.expectedStrokes))
  const pick = pickPar(plans, (p) => ({ club: p.club, strokes: p.expectedStrokes, penalty: penaltyShare(p), reach: p.meanTotalYds }))
  return pick ? pick.chosen.expectedStrokes : null
}

export function buildLookahead(args: LookaheadArgs): Lookahead {
  const cands: Candidate[] = args.clubs
    .filter((c) => c.shots.length > 0)
    .map((c) => ({
      club: c.club,
      carry: c.shots.reduce((a, s) => a + s.carryYds, 0) / c.shots.length,
      shots: { club: c.club, shots: seededSample(c.shots, LOOKAHEAD_SAMPLES, LOOKAHEAD_SEED) },
    }))
  const empty: Lookahead = { valueAt: () => null, cells: 0 }
  if (cands.length === 0 || args.line.length < 2) return empty

  const longest = Math.max(...cands.map((c) => c.carry))
  const lo = LOOKAHEAD_MIN_TEE_YDS
  const hi = longest * LOOKAHEAD_MAX_TEE_FACTOR
  const origin = args.from

  // Cell centres: within [lo, hi] of the tee and LOOKAHEAD_LATERAL_YDS of the hole line. The cell grows until it fits the cap.
  const line = args.line.map((p) => toLocal(origin, p))
  const minX = Math.min(...line.map((p) => p.x)) - LOOKAHEAD_LATERAL_YDS
  const maxX = Math.max(...line.map((p) => p.x)) + LOOKAHEAD_LATERAL_YDS
  const minY = Math.min(...line.map((p) => p.y)) - LOOKAHEAD_LATERAL_YDS
  const maxY = Math.max(...line.map((p) => p.y)) + LOOKAHEAD_LATERAL_YDS
  let size = LOOKAHEAD_CELL_YDS
  let centres: { ix: number; iy: number; p: LatLng }[] = []
  for (let guard = 0; guard < 20; guard++) {
    centres = []
    for (let ix = Math.floor(minX / size); ix <= Math.floor(maxX / size); ix++) {
      for (let iy = Math.floor(minY / size); iy <= Math.floor(maxY / size); iy++) {
        const p = fromLocal(origin, { x: (ix + 0.5) * size, y: (iy + 0.5) * size })
        const d = distanceYds(origin, p)
        if (d < lo || d > hi) continue
        if (projectOnLine(args.line, p).off > LOOKAHEAD_LATERAL_YDS) continue
        centres.push({ ix, iy, p })
      }
    }
    if (centres.length <= LOOKAHEAD_MAX_CELLS) break
    size *= 1.2
  }

  const values = new Map<string, number>()
  for (const c of centres) {
    const lie = args.lies.lieAt(c.p)
    if (NO_OPINION.has(lie)) continue
    const v = lie === "green" ? args.baseline.expectedStrokesRemaining("green", distanceYds(c.p, args.pin)) : bestNextShot(c.p, lie, cands, args)
    if (v != null) values.set(`${c.ix},${c.iy}`, v)
  }

  return {
    cells: values.size,
    valueAt: (l) => {
      if (NO_OPINION.has(l.lie)) return null
      const { x, y } = toLocal(origin, l.point)
      return values.get(`${Math.floor(x / size)},${Math.floor(y / size)}`) ?? null
    },
  }
}
