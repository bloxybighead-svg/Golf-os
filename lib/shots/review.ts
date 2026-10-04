// The review screen's logic: which uploaded shots look like partials or
// mishits, pre-ticked for exclusion so the golfer decides before anything is saved.

import { BAG_ORDER, type Club } from "@/lib/golfer/tables"
import type { ParsedShot } from "./types"

/**
 * A shot is a likely partial when its carry is under this share of the club's
 * 90th-percentile carry. Same rule and number as parse_sessions.py
 * (--partial-threshold 0.85); P90 rather than the median because wedge practice
 * is mostly deliberate partials, which drag a median down among them.
 */
export const PARTIAL_P90_RATIO = 0.85

/**
 * A shot is a likely top or duff when its carry is under this share of the
 * club's median carry. A judgement value, set at 60% by the session brief; a
 * normal full swing in the reference data bottoms out near 80% of the mean.
 */
export const OUTLIER_MEDIAN_RATIO = 0.6

export type Flag = "outlier" | "partial" | null

export interface ReviewShot {
  shot: ParsedShot
  flag: Flag
  /** Ticked to leave out. Starts true for every flagged shot. */
  excluded: boolean
}

/** Linear-interpolated quantile of an ascending list (numpy's default). */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function reviewShots(shots: ParsedShot[]): ReviewShot[] {
  const byClub = new Map<Club, number[]>()
  for (const s of shots) {
    const list = byClub.get(s.club)
    if (list) list.push(s.carryYds)
    else byClub.set(s.club, [s.carryYds])
  }
  const limits = new Map<Club, { outlier: number; partial: number }>()
  for (const [club, carries] of Array.from(byClub)) {
    const sorted = [...carries].sort((a, b) => a - b)
    limits.set(club, { outlier: OUTLIER_MEDIAN_RATIO * quantile(sorted, 0.5), partial: PARTIAL_P90_RATIO * quantile(sorted, 0.9) })
  }
  return shots.map((shot) => {
    const lim = limits.get(shot.club)!
    const flag: Flag = shot.carryYds < lim.outlier ? "outlier" : shot.isPartial || shot.carryYds < lim.partial ? "partial" : null
    return { shot, flag, excluded: flag !== null }
  })
}

export interface ClubCount {
  club: Club
  total: number
  kept: number
  flagged: number
}

export function clubCounts(review: ReviewShot[]): ClubCount[] {
  const m = new Map<Club, ClubCount>()
  for (const r of review) {
    const c = m.get(r.shot.club) ?? { club: r.shot.club, total: 0, kept: 0, flagged: 0 }
    c.total++
    if (!r.excluded) c.kept++
    if (r.flag) c.flagged++
    m.set(r.shot.club, c)
  }
  return BAG_ORDER.flatMap((c) => (m.has(c) ? [m.get(c)!] : []))
}

/** The shots to save: everything not ticked out, stored as full swings (the golfer chose to keep them). */
export function keptShots(review: ReviewShot[]): ParsedShot[] {
  return review.filter((r) => !r.excluded).map((r) => ({ ...r.shot, isPartial: false }))
}
