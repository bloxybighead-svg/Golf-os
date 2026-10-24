// Where this golfer loses strokes, as practice areas, and how urgently each needs work.
//
// Strokes gained is never recomputed here: lib/rounds/roundSg.ts is the only source. This file only
// re-cuts what it already returns, per hole, into the six areas a drill library is organised by.
//   putting  -> lag / short by the hole's first_putt_ft (>= LAG_PUTT_FT is lag); with no distance entered,
//               a hole with 3+ putts is lag (the cost of 3-putts) and every other hole is short.
//   approach -> wedges / approach by where the approach started (<= WEDGE_MAX_YDS is wedges).
//   tee and short game are the roundSg categories as they are (tee includes tee-shot penalty strokes).

import type { RoundSgResult, SgHoleRow } from "@/lib/rounds/roundSg"
import { tiger5, tiger5Pressure, type PressureArea, type Tiger5Round } from "@/lib/rounds/tiger5"

export type PracticeArea = PressureArea
export const PRACTICE_AREAS: readonly PracticeArea[] = ["lag_putting", "short_putting", "short_game", "wedges", "approach", "tee"]

export const AREA_LABEL: Record<PracticeArea, string> = {
  lag_putting: "Lag putting",
  short_putting: "Short putting",
  short_game: "Short game",
  wedges: "Wedges",
  approach: "Approach",
  tee: "Tee",
}

/** A first putt at least this long is a lag putt. From the spec. */
const LAG_PUTT_FT = 20
/** An approach starting this close or closer is a wedge shot. From the spec. */
const WEDGE_MAX_YDS = 120
/** Priority added per Tiger 5 mistake per round pointing at an area. From the spec. */
const TIGER5_WEIGHT = 0.25
/** Priority kept by an area whose drill score improved three sessions in a row. From the spec (a 25% cut). */
const IMPROVING_KEEP = 0.75
/** Rounds behind the strokes lost and the Tiger 5 pressure. From the spec. */
const SG_ROUNDS = 10
/** Rounds behind the correlation. From the spec. */
const CORRELATION_ROUNDS = 20
/** Fewest rounds with data before a correlation is shown. From the spec. */
const MIN_ROUNDS_FOR_R = 8

export interface WeaknessRound {
  sg: RoundSgResult
  holes: readonly SgHoleRow[]
  tiger5: Tiger5Round
  /** The round's score in the golfer's usual unit (strokes or differential), null when unknown. Only the correlation reads it. */
  score: number | null
}

export interface DrillScores {
  /** The area's primary drill, oldest first, skipped sets left out. */
  scores: readonly number[]
  lowerIsBetter: boolean
}

export interface AreaWeakness {
  area: PracticeArea
  /** Strokes lost per round against scratch over the last SG_ROUNDS rounds; null when no round has data. Negative = gained. */
  strokesLost: number | null
  rounds: number
  /** Tiger 5 mistakes per round pointing at this area. */
  pressure: number
  improving: boolean
  priority: number
  /** Correlation of strokes lost with score over the last 20 rounds. For display only; never part of the priority. */
  r: number | null
  explanation: string
}

type AreaValues = Record<PracticeArea, number | null>

const nullAreas = (): AreaValues => ({ lag_putting: null, short_putting: null, short_game: null, wedges: null, approach: null, tee: null })

/** One round's strokes gained per 18 holes in each area, and whether its putting split had to use 3-putts instead of distances. */
function areaValues(round: WeaknessRound): { values: AreaValues; threePuttSplit: boolean } {
  const values = nullAreas()
  if (round.sg.kind === "totals") {
    // Totals know no holes: putting comes from total putts and approach from greens hit (roundSg), but with no
    // distances they cannot be split, so putting counts as short putting and approach as approach.
    values.tee = round.sg.per18.off_tee
    values.short_game = round.sg.per18.short_game
    values.short_putting = round.sg.per18.putting
    values.approach = round.sg.per18.approach
    return { values, threePuttSplit: round.sg.per18.putting != null }
  }
  const holes = round.sg.holes.filter((h) => h.categories != null)
  if (holes.length === 0) return { values, threePuttSplit: false }

  const rows = new Map(round.holes.map((h) => [h.hole_number, h]))
  const sums: Record<PracticeArea, number> = { lag_putting: 0, short_putting: 0, short_game: 0, wedges: 0, approach: 0, tee: 0 }
  let threePuttSplit = false
  for (const h of holes) {
    const c = h.categories!
    const row = rows.get(h.holeNumber)
    const ft = row?.first_putt_ft ?? null
    if (ft == null) threePuttSplit = true
    const lag = ft != null ? ft >= LAG_PUTT_FT : (row?.putts ?? 0) >= 3
    sums[lag ? "lag_putting" : "short_putting"] += c.putting
    sums[h.approachStartYds != null && h.approachStartYds <= WEDGE_MAX_YDS ? "wedges" : "approach"] += c.approach
    sums.short_game += c.short_game
    sums.tee += c.off_tee
  }
  for (const a of PRACTICE_AREAS) values[a] = (sums[a] * 18) / holes.length
  return { values, threePuttSplit }
}

export interface StrokesLost {
  /** Positive = lost against scratch. Null when no round has data for the area. */
  strokesLost: number | null
  rounds: number
}

/** Strokes lost per round against scratch in each area, over the last SG_ROUNDS rounds (newest first). */
export function strokesLostPerRound(rounds: readonly WeaknessRound[]): Record<PracticeArea, StrokesLost> {
  const recent = rounds.slice(0, SG_ROUNDS).map((r) => areaValues(r).values)
  const out = {} as Record<PracticeArea, StrokesLost>
  for (const a of PRACTICE_AREAS) {
    const xs = recent.flatMap((v) => (v[a] == null ? [] : [v[a] as number]))
    out[a] = { strokesLost: xs.length > 0 ? -(xs.reduce((s, x) => s + x, 0) / xs.length) : null, rounds: xs.length }
  }
  return out
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length < MIN_ROUNDS_FOR_R) return null
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let sxy = 0
  let sxx = 0
  let syy = 0
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my)
    sxx += (x - mx) ** 2
    syy += (ys[i] - my) ** 2
  })
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy)
}

/** True when each of the last three scores beat the one before it. Needs four scores. */
export function improvedThreeInARow(scores: readonly number[], lowerIsBetter: boolean): boolean {
  if (scores.length < 4) return false
  const last = scores.slice(-4)
  return [1, 2, 3].every((i) => (lowerIsBetter ? last[i] < last[i - 1] : last[i] > last[i - 1]))
}

const oneDecimal = (n: number) => (Math.round(Math.abs(n) * 10) / 10).toFixed(1)

function explain(
  area: PracticeArea,
  lost: StrokesLost,
  extras: { threePutts: { count: number; rounds: number } | null; threePuttSplit: boolean; improving: boolean; pressure: number }
): string {
  const label = AREA_LABEL[area]
  if (lost.strokesLost == null) return `${label}: no rounds with enough entries to measure it yet.`
  const gap =
    lost.strokesLost >= 0.05
      ? `${oneDecimal(lost.strokesLost)} strokes/round lost vs scratch`
      : lost.strokesLost <= -0.05
        ? `gaining ${oneDecimal(lost.strokesLost)} strokes/round vs scratch`
        : "about even with scratch"
  const parts = [gap]
  if (area === "lag_putting" && extras.threePutts) parts.push(`3-putts on ${extras.threePutts.count} of your last ${extras.threePutts.rounds} rounds`)
  if ((area === "lag_putting" || area === "short_putting") && extras.threePuttSplit) {
    parts.push("no first-putt distance entered on some holes, so lag putting there is the cost of 3-putts and short putting is the rest")
  }
  if (extras.pressure >= 0.05) parts.push(`Tiger 5 mistakes pointing here: ${oneDecimal(extras.pressure)} per round`)
  if (extras.improving) parts.push("drill scores up three sessions running, so priority is cut 25%")
  return `${label}: ${parts.join(", ")}.`
}

/**
 * Each area's strokes lost, Tiger 5 pressure, priority and (display-only) correlation. `rounds` newest first, up to 20.
 * priority = max(0, strokes lost) + 0.25 x Tiger 5 mistakes per round, x 0.75 when the area's drill score has improved
 * three sessions in a row.
 */
export function weaknessScores(rounds: readonly WeaknessRound[], drillScores: Partial<Record<PracticeArea, DrillScores>> = {}): AreaWeakness[] {
  const lost = strokesLostPerRound(rounds)
  const recent = rounds.slice(0, SG_ROUNDS)
  const pressure = tiger5Pressure(recent.map((r) => r.tiger5))
  const known = recent.map((r) => tiger5(r.tiger5).items.three_putt).filter((v): v is number => v != null)
  const threePutts = known.length > 0 ? { count: known.filter((n) => n > 0).length, rounds: known.length } : null
  const threePuttSplit = recent.some((r) => areaValues(r).threePuttSplit)
  const forR = rounds.slice(0, CORRELATION_ROUNDS).map((r) => ({ values: areaValues(r).values, score: r.score }))

  return PRACTICE_AREAS.map((area) => {
    const ds = drillScores[area]
    const improving = ds != null && improvedThreeInARow(ds.scores, ds.lowerIsBetter)
    const priority = (Math.max(0, lost[area].strokesLost ?? 0) + TIGER5_WEIGHT * pressure[area]) * (improving ? IMPROVING_KEEP : 1)
    const pairs = forR.flatMap((x) => (x.values[area] == null || x.score == null ? [] : [{ lost: -(x.values[area] as number), score: x.score }]))
    return {
      area,
      strokesLost: lost[area].strokesLost,
      rounds: lost[area].rounds,
      pressure: pressure[area],
      improving,
      priority,
      r: pearson(pairs.map((p) => p.lost), pairs.map((p) => p.score)),
      explanation: explain(area, lost[area], { threePutts, threePuttSplit, improving, pressure: pressure[area] }),
    }
  })
}
