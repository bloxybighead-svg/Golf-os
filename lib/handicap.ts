// Handicap Index under the World Handicap System (USGA Rules of Handicapping,
// 2024 edition): https://www.usga.org/handicapping/roh/
//
//  - Score Differential (Rule 5.1a) = (113 / Slope) x (adjusted gross score -
//    Course Rating), rounded to the nearest tenth, .5 up. The playing
//    conditions calculation (PCC, Rule 5.6) needs everyone's scores that day,
//    so it's left out (taken as 0).
//  - Adjusted gross score (Rule 3.1): every hole capped at net double bogey
//    (par + 2 + strokes received) once the player has a Handicap Index; at
//    par + 5 before that.
//  - 9-hole scores (Rule 5.1b): the unrounded 9-hole differential plus the
//    player's EXPECTED 9-hole differential, then rounded. 10-17 holes (Rules
//    5.1a, 3.2b): the holes played plus an expected score for the rest.
//  - Handicap Index (Rule 5.2): from the most recent 20 differentials, the
//    lowest few (table below, for fewer than 20), rounded to the nearest
//    tenth, at most 54.0. A player has an index once 54 holes are posted
//    (Rule 5.1 / USGA 9-hole FAQ).
//  - Exceptional Score Reduction (Rule 5.9): a differential 7.0-9.9 better than
//    the Handicap Index it was played under takes -1.0 (10.0+: -2.0), and so do
//    the 19 differentials before it. The adjustment stays on them for good.
//  - Soft and hard cap (Rule 5.8): once there are 20 differentials, a new index
//    more than 3.0 above the Low Handicap Index (lowest index in the 365 days
//    before the latest round) has the part over 3.0 halved, and never goes more
//    than 5.0 above it.
// Left out (follow-up): PCC (5.6).

/** Fewer holes than this and a score doesn't count (Rule 5.1b). */
export const MIN_HOLES_FOR_DIFFERENTIAL = 9
/** Holes that have to be posted before a Handicap Index exists (Rule 5.1, USGA 9-hole FAQ). */
export const HOLES_TO_ESTABLISH_INDEX = 54
/** The highest Handicap Index (Rule 5.3). */
export const MAX_HANDICAP_INDEX = 54

/**
 * Expected 9-hole Score Differential = EXPECTED_9_PER_INDEX x index +
 * EXPECTED_9_CONSTANT. The WHS formula is proprietary (SCGA, "Great
 * Expectations"); this is the widely quoted approximation. It reproduces the
 * USGA's own worked example: index 14.0, 9-hole differential 7.2 ->
 * 7.2 + 8.48 = 15.68 -> 15.7 (USGA, "Treatment of 9-hole Scores" FAQ).
 */
export const EXPECTED_9_PER_INDEX = 0.52
export const EXPECTED_9_CONSTANT = 1.2

/** Rule 5.2a: with n differentials (3-20), how many of the lowest are averaged and what adjustment applies. */
export const INDEX_TABLE: readonly { min: number; max: number; lowest: number; adjustment: number }[] = [
  { min: 3, max: 3, lowest: 1, adjustment: -2 },
  { min: 4, max: 4, lowest: 1, adjustment: -1 },
  { min: 5, max: 5, lowest: 1, adjustment: 0 },
  { min: 6, max: 6, lowest: 2, adjustment: -1 },
  { min: 7, max: 8, lowest: 2, adjustment: 0 },
  { min: 9, max: 11, lowest: 3, adjustment: 0 },
  { min: 12, max: 14, lowest: 4, adjustment: 0 },
  { min: 15, max: 16, lowest: 5, adjustment: 0 },
  { min: 17, max: 18, lowest: 6, adjustment: 0 },
  { min: 19, max: 19, lowest: 7, adjustment: 0 },
  { min: 20, max: 20, lowest: 8, adjustment: 0 },
]

/** Rule 5.9: gap between index and differential at which a score is exceptional / very exceptional. */
export const ESR_THRESHOLD = 7.0
export const ESR_THRESHOLD_LARGE = 10.0
/** Rule 5.9: the reductions, and how many of the most recent differentials (the exceptional one included) take them. */
export const ESR_REDUCTION = -1.0
export const ESR_REDUCTION_LARGE = -2.0
export const ESR_WINDOW = 20
/** Rule 5.8: increase over the Low Handicap Index before the soft cap bites, the share of the excess kept, and the hard limit. */
export const SOFT_CAP_TRIGGER = 3.0
export const SOFT_CAP_KEEP = 0.5
export const HARD_CAP_LIMIT = 5.0
/** Rule 5.8: look-back for the Low Handicap Index, and the differentials needed before one exists. */
export const LOW_INDEX_DAYS = 365
export const DIFFERENTIALS_FOR_LOW_INDEX = 20

/** Round to the nearest tenth, .5 up (WHS rounding). The toFixed step stops 15.65 landing at 15.6499999. */
export function roundTenth(x: number): number {
  return Math.round(Number((x * 10).toFixed(6))) / 10 || 0 // "|| 0": no -0 (would show as "+0.0")
}

/** Round to a whole number, .5 up (Course Handicap rounding, Rule 6.1). */
function roundWhole(x: number): number {
  return Math.round(Number(x.toFixed(6)))
}

/**
 * Handicap Index from differentials ordered most recent first (only the
 * first 20 count). Null with fewer than 3.
 */
export function handicapIndexFrom(differentials: number[]): number | null {
  const recent = differentials.slice(0, 20)
  const row = INDEX_TABLE.find((r) => recent.length >= r.min && recent.length <= r.max)
  if (!row) return null
  const lowest = [...recent].sort((a, b) => a - b).slice(0, row.lowest)
  const avg = lowest.reduce((s, d) => s + d, 0) / row.lowest
  return Math.min(MAX_HANDICAP_INDEX, roundTenth(avg + row.adjustment))
}

// ---- Exceptional score reduction (Rule 5.9) ----------------------------------

/**
 * Rule 5.9: the reduction a new differential earns against the Handicap Index
 * the player held when it was played. 7.0-9.9 strokes lower: -1.0; 10.0 or
 * more: -2.0; otherwise 0. No index, no reduction.
 */
export function exceptionalScoreReduction(differential: number, indexAtTime: number | null): number {
  if (indexAtTime == null) return 0
  const gap = roundTenth(indexAtTime - differential) // tenths, so 6.9999999 can't miss a 7.0
  if (gap >= ESR_THRESHOLD_LARGE) return ESR_REDUCTION_LARGE
  if (gap >= ESR_THRESHOLD) return ESR_REDUCTION
  return 0
}

/**
 * Rule 5.9: adds `reduction` to the exceptional differential and the 19 before
 * it. `adjustments` is each differential's running adjustment, most recent
 * first (index 0 = the exceptional score). Returns a new array; with fewer
 * than 20 differentials all of them take it. Older ones are left alone.
 */
export function applyReductionToWindow(adjustments: number[], reduction: number): number[] {
  return adjustments.map((a, i) => (i < ESR_WINDOW ? a + reduction : a))
}

// ---- Soft and hard cap (Rule 5.8) ---------------------------------------------

export type IndexCap = "none" | "soft" | "hard"

export interface IndexOnDate {
  date: string // YYYY-MM-DD
  index: number
}

/**
 * Rule 5.8: the Low Handicap Index, the lowest index held in the 365 days before
 * `asOfDate` (the day of the most recent round). Null with no index in that
 * window. The caller passes only indexes that count (see recalculateRounds).
 */
export function lowHandicapIndex(history: IndexOnDate[], asOfDate: string): number | null {
  const end = Date.parse(`${asOfDate}T00:00:00Z`)
  const start = end - LOW_INDEX_DAYS * 86_400_000
  let low: number | null = null
  for (const h of history) {
    const t = Date.parse(`${h.date}T00:00:00Z`)
    if (t >= start && t < end && (low == null || h.index < low)) low = h.index
  }
  return low
}

/**
 * Rule 5.8: limits a newly calculated index against the Low Handicap Index.
 * More than 3.0 above it: the excess over 3.0 is halved (soft cap). Then never
 * more than 5.0 above it (hard cap). Decreases are never limited. No Low
 * Handicap Index: nothing to cap against.
 */
export function applyIndexCaps(calculated: number, low: number | null): { index: number; cap: IndexCap } {
  if (low == null || calculated <= low + SOFT_CAP_TRIGGER) return { index: calculated, cap: "none" }
  const soft = low + SOFT_CAP_TRIGGER + (calculated - low - SOFT_CAP_TRIGGER) * SOFT_CAP_KEEP
  const hardLimit = low + HARD_CAP_LIMIT
  if (soft > hardLimit) return { index: roundTenth(hardLimit), cap: "hard" }
  return { index: roundTenth(soft), cap: "soft" }
}

/**
 * Course Handicap (Rule 6.1) for the holes being played, rounded to a whole
 * number. 18 holes: index x slope/113 + (rating - par). 9 holes: index / 2
 * (to a tenth) instead of the index (6.1b). Other counts scale the index the
 * same way (holes / 18) -- an approximation; WHS has no 10-17 hole rating.
 */
export function courseHandicap(index: number, slope: number, rating: number, par: number, holes = 18): number {
  const indexPart = holes === 18 ? index : holes === 9 ? roundTenth(index / 2) : (index * holes) / 18
  return roundWhole(indexPart * (slope / 113) + (rating - par))
}

/**
 * Handicap strokes a player gets on a hole, from the hole's stroke index
 * ranked among the holes played (1 = hardest). A Course Handicap of 20 over
 * 18 holes is 1 on every hole plus a second on the two hardest. A plus
 * handicap gives strokes back on the easiest holes.
 */
export function strokesReceived(courseHcp: number, rank: number, holes: number): number {
  const n = Math.max(1, holes)
  if (courseHcp >= 0) return Math.floor(courseHcp / n) + (rank <= courseHcp % n ? 1 : 0)
  const give = -courseHcp
  return -(Math.floor(give / n) + (rank > n - (give % n) ? 1 : 0)) || 0
}

/** Expected 9-hole Score Differential for an index (see EXPECTED_9_PER_INDEX). */
export function expectedNineHoleDifferential(index: number): number {
  return EXPECTED_9_PER_INDEX * index + EXPECTED_9_CONSTANT
}

/** How a round's hole scores were capped. */
export type ScoreCap = "net_double_bogey" | "par_plus_5" | "approximate" | "none"

export interface HoleScore {
  par: number
  strokes: number
  strokeIndex: number | null
}

/**
 * Adjusted gross score (Rule 3.1). With an index: net double bogey on every
 * hole (par + 2 + strokes received). Without stroke indexes the strokes per
 * hole aren't known, so each hole gets par + 2 + the course handicap spread
 * evenly (rounded) -- "approximate". Without an index: par + 5.
 */
export function adjustHoles(
  holes: HoleScore[],
  ctx: { index: number | null; rating: number | null; slope: number | null }
): { adjusted: number; cap: ScoreCap; holeCaps: number[] } {
  const n = holes.length
  const sumPar = holes.reduce((s, h) => s + h.par, 0)
  const capped = (caps: number[], cap: ScoreCap) => ({
    adjusted: holes.reduce((s, h, i) => s + Math.min(h.strokes, caps[i]), 0),
    cap,
    holeCaps: caps,
  })
  if (ctx.index == null) return capped(holes.map((h) => h.par + 5), "par_plus_5")

  // Without a rating, take the course as par-rated, slope 113 (only the index decides the strokes).
  const ch = courseHandicap(ctx.index, ctx.slope ?? 113, ctx.rating ?? sumPar, sumPar, n)
  const indexes = holes.map((h) => h.strokeIndex)
  if (indexes.some((s) => s == null)) {
    const each = Math.round(ch / n)
    return capped(holes.map((h) => h.par + 2 + each), "approximate")
  }
  // Rank by stroke index among the holes played (a 9-hole round uses its own nine).
  const order = holes.map((h, i) => ({ i, si: h.strokeIndex as number })).sort((a, b) => a.si - b.si || a.i - b.i)
  const rank = new Array<number>(n)
  order.forEach((o, r) => (rank[o.i] = r + 1))
  return capped(holes.map((h, i) => h.par + 2 + strokesReceived(ch, rank[i], n)), "net_double_bogey")
}

export type DifferentialStatus = "rated" | "waiting_for_index" | "no_rating" | "too_short"

/** Unrounded differential for the holes played: (113 / slope) x (adjusted - rating). */
function playedDifferential(adjusted: number, rating: number, slope: number): number {
  return (113 / slope) * (adjusted - rating)
}

/**
 * The 18-hole Score Differential for a round, given the index at the time.
 * 9 holes: played + expected 9-hole differential. 10-17 holes: played +
 * expected 9-hole differential x (unplayed / 9) -- the expected score spread
 * per hole (approximation of Rule 3.2b). Shorter rounds need an index.
 */
export function scoreDifferential(
  r: { adjusted: number; rating: number | null; slope: number | null; holes: number },
  index: number | null
): { differential: number | null; status: DifferentialStatus } {
  if (r.holes < MIN_HOLES_FOR_DIFFERENTIAL) return { differential: null, status: "too_short" }
  if (r.rating == null || r.slope == null || !(r.slope > 0)) return { differential: null, status: "no_rating" }
  const played = playedDifferential(r.adjusted, r.rating, r.slope)
  if (r.holes >= 18) return { differential: roundTenth(played), status: "rated" }
  if (index == null) return { differential: null, status: "waiting_for_index" }
  const unplayed = 18 - r.holes
  return { differential: roundTenth(played + (expectedNineHoleDifferential(index) * unplayed) / 9), status: "rated" }
}

/**
 * Quick 18-hole differential for a form preview (no caps, no index). Null for
 * anything but 18 holes: shorter rounds need the golfer's index.
 */
export function calcDifferential(score: number, courseRating: number, slopeRating: number, holesPlayed = 18): number | null {
  if (holesPlayed !== 18 || !Number.isFinite(score) || !Number.isFinite(courseRating) || !(slopeRating > 0)) return null
  return roundTenth(playedDifferential(score, courseRating, slopeRating))
}

// ---- The whole scoring record ------------------------------------------------

export interface RoundForHandicap {
  id: string
  date: string // YYYY-MM-DD
  createdAt: string // orders rounds on the same day
  score: number // gross
  holesPlayed: number
  courseRating: number | null
  slopeRating: number | null
  /** Hole-by-hole scores; null for a score-only round (not capped). */
  holes: HoleScore[] | null
}

/** A Handicap Index entered by hand (e.g. from GHIN), used before the app has calculated one. */
export interface ManualIndex {
  date: string // YYYY-MM-DD
  index: number
}

export interface RoundResult {
  id: string
  /** Adjusted gross score; null for score-only rounds (posted as entered). */
  adjustedScore: number | null
  scoreCap: ScoreCap
  differential: number | null
  status: DifferentialStatus
  /** The Handicap Index used for this round's caps and expected score. */
  indexUsed: number | null
  /** Rule 5.9 reduction sitting on this differential (0 or negative); already included in `differential`. */
  esrAdjustment: number
}

/** What shaped the final index, for display. */
export interface IndexAdjustments {
  /** Index before the soft/hard cap. */
  calculatedIndex: number | null
  lowIndex: number | null
  cap: IndexCap
  /** Sum of the Rule 5.9 reductions still acting on the differentials behind the index (0 or negative). */
  esr: number
}

/**
 * Re-scores the whole record in date order, the way WHS would have: each
 * round is capped and (if short) completed with the index the player had at
 * the start of that day. Before 54 holes are posted there's no calculated
 * index -- a hand-entered one dated on or before the round stands in, else
 * none (par + 5 caps, short rounds wait). When the 54th hole is posted, the
 * waiting short rounds get a provisional index (their played differential
 * scaled to 18 holes, as the old method did) and are then completed with it
 * -- the WHS's own initial step is automated and unpublished, so this is an
 * approximation.
 */
export function recalculateRounds(
  rounds: RoundForHandicap[],
  manual: ManualIndex[] = []
): { results: RoundResult[]; index: number | null; differentialsUsed: number; adjustments: IndexAdjustments } {
  const ordered = [...rounds].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const manualSorted = [...manual].sort((a, b) => a.date.localeCompare(b.date))
  const results = new Map<string, RoundResult>()
  // Rated rounds so far. `differential` is the raw one; `adj` the Rule 5.9 total on it; `events` which exceptional scores gave it.
  const rated: { order: number; id: string; differential: number; adj: number; events: number[] }[] = []
  const waiting: { order: number; round: RoundForHandicap; adjusted: number }[] = []
  const esrAmounts: number[] = [] // by event number
  // Indexes that can be a Low Handicap Index: hand-entered ones, and calculated ones built on 20 differentials (Rule 5.8).
  const lowCandidates: IndexOnDate[] = manualSorted.map((m) => ({ date: m.date, index: m.index }))
  let holesPosted = 0
  let established = false
  let current: number | null = null // the capped index after the latest day
  let last: IndexAdjustments = { calculatedIndex: null, lowIndex: null, cap: "none", esr: 0 }

  const recent = () => [...rated].sort((a, b) => b.order - a.order).slice(0, 20)
  const manualAsOf = (date: string) => {
    let v: number | null = null
    for (const m of manualSorted) if (m.date <= date) v = m.index
    return v
  }

  let i = 0
  while (i < ordered.length) {
    const date = ordered[i].date
    const index = current ?? manualAsOf(date)
    // Every round on this day uses the index from the start of the day.
    for (; i < ordered.length && ordered[i].date === date; i++) {
      const r = ordered[i]
      const adj = r.holes
        ? adjustHoles(r.holes, { index, rating: r.courseRating, slope: r.slopeRating })
        : { adjusted: r.score, cap: "none" as ScoreCap }
      const d = scoreDifferential({ adjusted: adj.adjusted, rating: r.courseRating, slope: r.slopeRating, holes: r.holesPlayed }, index)
      results.set(r.id, { id: r.id, adjustedScore: r.holes ? adj.adjusted : null, scoreCap: adj.cap, ...d, indexUsed: index, esrAdjustment: 0 })
      if (d.status === "rated") {
        rated.push({ order: i, id: r.id, differential: d.differential as number, adj: 0, events: [] })
        // Rule 5.9: judged against the index held when it was played, applied to it and the 19 before it.
        const reduction = exceptionalScoreReduction(d.differential as number, index)
        if (reduction !== 0) {
          const window = recent()
          const next = applyReductionToWindow(window.map((w) => w.adj), reduction)
          esrAmounts.push(reduction)
          window.forEach((w, k) => {
            w.adj = next[k]
            if (k < ESR_WINDOW) w.events.push(esrAmounts.length - 1)
          })
        }
      }
      if (d.status === "waiting_for_index") waiting.push({ order: i, round: r, adjusted: adj.adjusted })
      if (d.status === "rated" || d.status === "waiting_for_index") holesPosted += Math.min(18, r.holesPlayed)
    }

    if (!established && holesPosted >= HOLES_TO_ESTABLISH_INDEX) {
      established = true
      // Provisional index: waiting short rounds scaled to 18 holes.
      const provisional = handicapIndexFrom(
        [
          ...rated,
          ...waiting.map((w) => ({
            order: w.order,
            differential: roundTenth(
              playedDifferential(w.adjusted, w.round.courseRating as number, w.round.slopeRating as number) * (18 / w.round.holesPlayed)
            ),
          })),
        ]
          .sort((a, b) => b.order - a.order)
          .map((r) => r.differential)
      )
      for (const w of waiting.splice(0)) {
        const d = scoreDifferential(
          { adjusted: w.adjusted, rating: w.round.courseRating, slope: w.round.slopeRating, holes: w.round.holesPlayed },
          provisional
        )
        const prev = results.get(w.round.id) as RoundResult
        results.set(w.round.id, { ...prev, ...d })
        if (d.status === "rated") rated.push({ order: w.order, id: w.round.id, differential: d.differential as number, adj: 0, events: [] })
      }
    }

    if (established) {
      const window = recent()
      const calculated = handicapIndexFrom(window.map((r) => r.differential + r.adj))
      if (calculated == null) {
        current = null
        last = { calculatedIndex: null, lowIndex: null, cap: "none", esr: 0 }
      } else {
        // Rule 5.8: caps only once there are 20 differentials; the Low Handicap Index looks at the 365 days before today's round.
        const full = rated.length >= DIFFERENTIALS_FOR_LOW_INDEX
        const low = full ? lowHandicapIndex(lowCandidates, date) : null
        const capped = applyIndexCaps(calculated, low)
        current = Math.min(MAX_HANDICAP_INDEX, capped.index)
        if (full) lowCandidates.push({ date, index: current })
        const active = new Set(window.flatMap((w) => w.events))
        last = {
          calculatedIndex: calculated,
          lowIndex: low,
          cap: capped.cap,
          esr: [...active].reduce((s, e) => s + esrAmounts[e], 0),
        }
      }
    }
  }

  // The differentials that count carry their Rule 5.9 reductions.
  for (const r of rated) {
    const prev = results.get(r.id) as RoundResult
    results.set(r.id, { ...prev, differential: roundTenth(r.differential + r.adj), esrAdjustment: r.adj })
  }

  return {
    results: rounds.map((r) => results.get(r.id) as RoundResult),
    index: current,
    differentialsUsed: Math.min(20, rated.length),
    adjustments: last,
  }
}

/** Short notes on what shaped a calculated index: Rule 5.9 reductions and Rule 5.8 caps. */
export function adjustmentNotesFor(entry: { esr_adjustment?: number | string | null; cap_applied?: string | null }): string[] {
  const notes: string[] = []
  const esr = Number(entry.esr_adjustment ?? 0)
  if (esr < 0) notes.push(`Exceptional score: ${esr.toFixed(1)} applied`)
  if (entry.cap_applied === "soft") notes.push("Soft cap applied")
  if (entry.cap_applied === "hard") notes.push("Hard cap applied")
  return notes
}

/** Index from the record, for display (same as recalculateRounds' final index). */
export function estimateHandicapIndex(differentials: number[]): number | null {
  return handicapIndexFrom(differentials)
}

/**
 * Whether a freshly calculated index should be written to handicap_tracking.
 * Rounds recalculate on every save, so this keeps the history to real changes:
 * skip when there's no index yet or when the latest entry is already a
 * calculated one with the same value. A newer calculation does replace a
 * manual entry as the current index.
 */
export function needsNewCalculatedEntry(
  latest: { source: string; handicap_index: number | string; esr_adjustment?: number | string | null; cap_applied?: string | null } | null,
  index: number | null,
  flags?: { esr: number; cap: IndexCap }
): boolean {
  if (index == null) return false
  if (!latest) return true
  if (latest.source !== "calculated" || Number(latest.handicap_index) !== index) return true
  // Same index: still record it when the adjustments behind it changed.
  if (!flags) return false
  return Number(latest.esr_adjustment ?? 0) !== flags.esr || (latest.cap_applied ?? "none") !== flags.cap
}
