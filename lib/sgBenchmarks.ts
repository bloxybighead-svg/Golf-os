// Category strokes-gained PROXY, estimated from box-score stats (fairways%,
// GIR%, putts, up-and-downs) already collected by the Rounds feature.
//
// This is NOT measured shot-by-shot strokes gained. True SG (Broadie/
// ShotLink-style, the same methodology `lib/course/cost.ts` uses for the
// Course Planner) needs per-shot distance/lie data; the Rounds feature only
// ever logs aggregate box-score stats per round. So instead: each bracket's
// typical fairways%/GIR%/putts-per-18/up-and-down% below was researched from
// public handicap-stat breakdowns (breakxgolf.com, mygolfspy.com,
// practical-golf.com, 2026) -- real numbers. Converting a stat GAP into a
// strokes value uses per-event stroke-cost estimates reasoned from published
// ranges for those events (cited inline below), not independently measured
// for this app -- swap for a measured value if this app ever tracks
// shot-level data during a logged round. Putting is the one exact category:
// a putt literally is a stroke, so it's a real count, not an estimate.

export type SgCategory = "off_tee" | "approach" | "short_game" | "putting"

// Scratch/(0,2]-handicap reference point every user_sg value is measured
// against (also the (0,2] row's value in sg_benchmarks -- both zero by
// construction).
const SCRATCH_FAIRWAY_PCT = 56.5
const SCRATCH_GIR_PCT = 55
const SCRATCH_PUTTS_PER_18 = 30
const SCRATCH_UPDOWN_PCT = 50.0

const FAIRWAY_OPPORTUNITIES_PER_18 = 14 // typical par-4/par-5 count on an 18-hole course

// Per-event stroke values -- reasoned estimates, not independently measured:
// missed-fairway cost is cited anywhere from ~0.06 (a modest amateur miss)
// to ~0.25 (PGA TOUR rough/sand); missed-green cost from ~0.3 (Broadie-scale
// approach SG swings) up to ~1.6 (an informal estimate); failed-up-and-down
// cost assumed the same order of magnitude as a missed green.
const STROKES_PER_MISSED_FAIRWAY = 0.2
const STROKES_PER_MISSED_GREEN = 0.5
const STROKES_PER_FAILED_UP_AND_DOWN = 0.5

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Off-tee proxy: fairways-hit gap vs. scratch, over this round's own par-4/5 opportunity count. */
function offTeeSg(fairwaysPct: number, holesPlayed: number): number {
  const opportunities = FAIRWAY_OPPORTUNITIES_PER_18 * (holesPlayed / 18)
  return round2(((fairwaysPct - SCRATCH_FAIRWAY_PCT) / 100) * opportunities * STROKES_PER_MISSED_FAIRWAY)
}

/** Approach proxy: GIR gap vs. scratch, over every hole actually played. */
function approachSg(girPct: number, holesPlayed: number): number {
  return round2(((girPct - SCRATCH_GIR_PCT) / 100) * holesPlayed * STROKES_PER_MISSED_GREEN)
}

/** Short-game proxy: up-and-down rate gap vs. scratch, over this round's own missed-green count. */
function shortGameSg(girPct: number, upAndDowns: number, holesPlayed: number): number | null {
  const missedGreens = holesPlayed * (1 - girPct / 100)
  if (missedGreens < 1) return null // not enough missed-green opportunities to estimate a rate
  const upDownRatePct = Math.min(upAndDowns / missedGreens, 1) * 100
  return round2(((upDownRatePct - SCRATCH_UPDOWN_PCT) / 100) * missedGreens * STROKES_PER_FAILED_UP_AND_DOWN)
}

/**
 * Putting proxy: putts taken vs. the scratch-average putt count for this many
 * holes. Exact, not an approximation like the other three -- a putt IS a
 * stroke, so this is a real count, just not adjusted for starting distance
 * the way real strokes-gained-putting is.
 */
function puttingSg(totalPutts: number, holesPlayed: number): number {
  const benchmarkPutts = SCRATCH_PUTTS_PER_18 * (holesPlayed / 18)
  return round2(benchmarkPutts - totalPutts)
}

export interface RoundStatsForSg {
  holesPlayed: number
  fairwaysPct: number | null
  girPct: number | null
  totalPutts: number | null
  upAndDowns: number | null
}

export interface CategorySg {
  category: SgCategory
  userSg: number
}

/**
 * Computes whichever category proxies this round has enough logged data
 * for -- a round missing e.g. fairways_pct simply omits "off_tee" rather
 * than guessing.
 */
export function computeUserSg(stats: RoundStatsForSg): CategorySg[] {
  const out: CategorySg[] = []
  if (stats.fairwaysPct != null) {
    out.push({ category: "off_tee", userSg: offTeeSg(stats.fairwaysPct, stats.holesPlayed) })
  }
  if (stats.girPct != null) {
    out.push({ category: "approach", userSg: approachSg(stats.girPct, stats.holesPlayed) })
  }
  if (stats.girPct != null && stats.upAndDowns != null) {
    const sg = shortGameSg(stats.girPct, stats.upAndDowns, stats.holesPlayed)
    if (sg != null) out.push({ category: "short_game", userSg: sg })
  }
  if (stats.totalPutts != null) {
    out.push({ category: "putting", userSg: puttingSg(stats.totalPutts, stats.holesPlayed) })
  }
  return out
}

const HANDICAP_BRACKETS: readonly { low: number; high: number }[] = [
  { low: 0, high: 2 },
  { low: 2, high: 5 },
  { low: 5, high: 10 },
  { low: 10, high: 15 },
  { low: 15, high: 20 },
  { low: 20, high: 25 },
  { low: 25, high: 36 },
]

export interface CategoryTrend {
  category: SgCategory
  avgUserSg: number
  avgBenchmarkSg: number
  avgDeltaSg: number
  roundsCounted: number
}

const CATEGORY_ORDER: readonly SgCategory[] = ["off_tee", "approach", "short_game", "putting"]

/** Averages a set of round_analysis rows (already limited to whatever window -- e.g. last 10 rounds -- by the caller) per category. */
export function aggregateCategoryTrends(
  rows: readonly { category: SgCategory; user_sg: number; benchmark_sg: number; delta_sg: number }[]
): CategoryTrend[] {
  const out: CategoryTrend[] = []
  for (const category of CATEGORY_ORDER) {
    const rowsForCategory = rows.filter((r) => r.category === category)
    if (rowsForCategory.length === 0) continue
    const n = rowsForCategory.length
    out.push({
      category,
      avgUserSg: round2(rowsForCategory.reduce((a, r) => a + r.user_sg, 0) / n),
      avgBenchmarkSg: round2(rowsForCategory.reduce((a, r) => a + r.benchmark_sg, 0) / n),
      avgDeltaSg: round2(rowsForCategory.reduce((a, r) => a + r.delta_sg, 0) / n),
      roundsCounted: n,
    })
  }
  return out
}

export type TrendQualifier = "Elite for your HCP" | "Above average" | "Average" | "Needs work"

/** Qualitative label for a category's average delta vs. the golfer's own handicap bracket. */
export function qualifierFor(avgDeltaSg: number): TrendQualifier {
  if (avgDeltaSg >= 0.3) return "Elite for your HCP"
  if (avgDeltaSg >= 0) return "Above average"
  if (avgDeltaSg >= -0.3) return "Average"
  return "Needs work"
}

/**
 * Which sg_benchmarks bracket a handicap index falls into -- an ascending
 * scan by `high` so boundary values (and anything below 0, for a plus-
 * handicap golfer) resolve to the lower/nearest bracket rather than falling
 * through a gap.
 */
export function handicapBracketRange(handicapIndex: number): { low: number; high: number } {
  for (const b of HANDICAP_BRACKETS) {
    if (handicapIndex <= b.high) return b
  }
  return HANDICAP_BRACKETS[HANDICAP_BRACKETS.length - 1]
}
