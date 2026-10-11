// One shot of look-ahead for any shot that cannot reach the pin.
//
// The plain value of a spot is a table lookup: strokes to hole out from this
// lie at this distance. That table assumes the distance can be played, so a
// shot that leaves 330 yd to the pin is valued as if you could just hit it.
// Here every spot the shot can finish gets a value from the best
// NEXT shot instead: each club (a few samples, its own best aim among a few),
// played from that spot and scored with the same baseline as the tee shot
// itself; the best club's expected strokes is the spot's value. A cell holds one value per lie in it, so a bunker
// inside a fairway cell is not valued as fairway. The shot is
// then worth the average grid value at its finish spots.
//
// The grid is laid out around the ball, so the worker keeps one per hole and
// ball cell (rankRequest.ts) rather than rebuilding it as the ball is dragged.

import { bearingDeg, distanceYds, fromLocal, toLocal, type LatLng } from "./geo"
import { projectOnLine } from "./aim"
import type { Baseline } from "./baseline"
import type { StartLie } from "./cost"
import type { Lie, LieMap } from "./lies"
import type { ShotConditions } from "./playsLike"
import { evaluateClub, isTeeOnly, type ClubShots, type Landing } from "./plan"
import { BASE_ROLL_YDS, clubGroup } from "./roll"
import {
  LOOKAHEAD_AIM_OFFSETS,
  LOOKAHEAD_CELL_YDS,
  LOOKAHEAD_LATERAL_YDS,
  LOOKAHEAD_MAX_CELLS,
  LOOKAHEAD_MAX_CLUBS,
  LOOKAHEAD_MAX_VALUATIONS,
  LOOKAHEAD_MAX_FACTOR,
  LOOKAHEAD_MIN_YDS,
  LOOKAHEAD_SAMPLES,
  LOOKAHEAD_SEED,
} from "./strategy"
import { seededSample } from "@/lib/dispersion/stats"

export interface LookaheadArgs {
  /** The bag, with the on-course spread already applied. */
  clubs: ClubShots[]
  /** Where the ball is: the grid is laid out in local yards around it. */
  from: LatLng
  pin: LatLng
  /** The hole's centreline: the grid covers LOOKAHEAD_LATERAL_YDS either side of it. */
  line: LatLng[]
  lies: LieMap
  baseline: Baseline
  /** Wind and ground height for the next shot too (playsLike.ts). */
  conditions?: ShotConditions | null
}

export interface Lookahead {
  /** Strokes still to play from where `l` stopped, valued by the best next shot; null where the grid has no opinion. */
  valueAt: (l: Landing) => number | null
  cells: number
}

/** Where inside a cell (as a fraction of its size from the centre) the lies are sampled: a 3x3 set of points. */
const SAMPLE_OFFSETS = [-1 / 3, 0, 1 / 3]

const NO_OPINION: ReadonlySet<Lie> = new Set<Lie>(["water", "oob"])

interface Candidate {
  club: string
  carry: number
  shots: ClubShots
}

/** The longest mean total (carry + fairway roll) of any club hit from `startLie`: tee-only clubs count only from the tee. */
export function longestTotalYds(clubs: ClubShots[], startLie: StartLie): number {
  const totals = clubs
    .filter((c) => c.shots.length > 0 && (startLie === "tee" || !isTeeOnly(c.club)))
    .map((c) => c.shots.reduce((a, s) => a + s.carryYds, 0) / c.shots.length + BASE_ROLL_YDS[clubGroup(c.club)])
  return Math.max(0, ...totals)
}

/** The best next shot from `at` (strokes to hole out, this shot included), or null with no clubs. */
export function bestNextShot(at: LatLng, lie: Lie, cands: Candidate[], args: LookaheadArgs): number | null {
  const d = distanceYds(at, args.pin)
  const nearest = [...cands].sort((a, b) => Math.abs(a.carry - d) - Math.abs(b.carry - d)).slice(0, LOOKAHEAD_MAX_CLUBS)
  const toPin = bearingDeg(at, args.pin)
  let best = Infinity
  for (const c of nearest) {
    for (const off of LOOKAHEAD_AIM_OFFSETS) {
      const bearing = (toPin + (Math.atan2(off, Math.max(c.carry, 10)) * 180) / Math.PI + 360) % 360
      const plan = evaluateClub(c.shots, { from: at, aim: args.pin, pin: args.pin, lies: args.lies, startLie: lie, baseline: args.baseline, conditions: args.conditions }, bearing)
      if (plan.expectedStrokes < best) best = plan.expectedStrokes
    }
  }
  if (!Number.isFinite(best)) return null
  // The simulated next shot does not depend on the lie it starts from, so add what the baseline says that lie costs over fairway at this distance.
  return best + args.baseline.expectedStrokesRemaining(lie, d) - args.baseline.expectedStrokesRemaining("fairway", d)
}

export function buildLookahead(args: LookaheadArgs): Lookahead {
  const played = args.clubs.filter((c) => c.shots.length > 0)
  // Next shots are played off the ground, so tee clubs are not candidates (they still set how far a tee shot can finish).
  const cands: Candidate[] = played
    .filter((c) => !isTeeOnly(c.club))
    .map((c) => ({
      club: c.club,
      carry: c.shots.reduce((a, s) => a + s.carryYds, 0) / c.shots.length,
      shots: { club: c.club, shots: seededSample(c.shots, LOOKAHEAD_SAMPLES, LOOKAHEAD_SEED) },
    }))
  const empty: Lookahead = { valueAt: () => null, cells: 0 }
  if (cands.length === 0 || args.line.length < 2) return empty

  const longest = Math.max(...played.map((c) => c.shots.reduce((a, s) => a + s.carryYds, 0) / c.shots.length))
  const lo = LOOKAHEAD_MIN_YDS
  const hi = longest * LOOKAHEAD_MAX_FACTOR
  const origin = args.from

  // Cell centres: within [lo, hi] of the ball and LOOKAHEAD_LATERAL_YDS of the hole line. A cell is valued once per playable
  // lie found inside it (a 3x3 sample), so a bunker in a fairway cell gets its own value. The cell grows until both the
  // cell count and the number of valuations fit their caps.
  const line = args.line.map((p) => toLocal(origin, p))
  const minX = Math.min(...line.map((p) => p.x)) - LOOKAHEAD_LATERAL_YDS
  const maxX = Math.max(...line.map((p) => p.x)) + LOOKAHEAD_LATERAL_YDS
  const minY = Math.min(...line.map((p) => p.y)) - LOOKAHEAD_LATERAL_YDS
  const maxY = Math.max(...line.map((p) => p.y)) + LOOKAHEAD_LATERAL_YDS
  let size = LOOKAHEAD_CELL_YDS
  let centres: { ix: number; iy: number; p: LatLng; lies: Lie[] }[] = []
  for (let guard = 0; guard < 20; guard++) {
    centres = []
    let valuations = 0
    for (let ix = Math.floor(minX / size); ix <= Math.floor(maxX / size); ix++) {
      for (let iy = Math.floor(minY / size); iy <= Math.floor(maxY / size); iy++) {
        const p = fromLocal(origin, { x: (ix + 0.5) * size, y: (iy + 0.5) * size })
        const d = distanceYds(origin, p)
        if (d < lo || d > hi) continue
        if (projectOnLine(args.line, p).off > LOOKAHEAD_LATERAL_YDS) continue
        centres.push({ ix, iy, p, lies: [] })
      }
    }
    if (centres.length > LOOKAHEAD_MAX_CELLS) {
      size *= 1.2
      continue
    }
    for (const c of centres) {
      const found = new Set<Lie>()
      for (const dx of SAMPLE_OFFSETS) {
        for (const dy of SAMPLE_OFFSETS) {
          const lie = args.lies.lieAt(fromLocal(origin, { x: (c.ix + 0.5 + dx) * size, y: (c.iy + 0.5 + dy) * size }))
          if (!NO_OPINION.has(lie)) found.add(lie)
        }
      }
      c.lies = [...found]
      valuations += c.lies.filter((l) => l !== "green").length
    }
    if (valuations <= LOOKAHEAD_MAX_VALUATIONS) break
    size *= 1.2
  }

  const values = new Map<string, number>()
  for (const c of centres) {
    for (const lie of c.lies) {
      const v = lie === "green" ? args.baseline.expectedStrokesRemaining("green", distanceYds(c.p, args.pin)) : bestNextShot(c.p, lie, cands, args)
      if (v != null) values.set(`${c.ix},${c.iy},${lie}`, v)
    }
  }

  return {
    cells: values.size,
    valueAt: (l) => {
      if (NO_OPINION.has(l.lie)) return null
      const { x, y } = toLocal(origin, l.point)
      return values.get(`${Math.floor(x / size)},${Math.floor(y / size)},${l.lie}`) ?? null
    },
  }
}
