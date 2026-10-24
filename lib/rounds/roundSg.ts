// Strokes gained of a round: the one entry point everything shows.
//
// Per hole it uses the tracked shots when that hole's tracking is complete and
// they add up, else the scorecard estimate (lib/rounds/sgEstimate.ts). A round
// with no holes at all (a box score entered by hand) falls back to the proxy
// from its totals (lib/sgBenchmarks.ts), which is always measured against a
// scratch golfer and is labelled as an estimate.

import type { Baseline } from "@/lib/course/baseline"
import { computeUserSg, type SgCategory } from "@/lib/sgBenchmarks"
import { estimateHoleSg, SG_CATEGORIES, type HoleSg, type HoleYards } from "./sgEstimate"
import type { PenaltyShot } from "./holes"
import type { HoleTracking } from "./holeTracking"
import type { RoundShot } from "./shots"
import { shotHoleSg } from "./strokesGained"

/** The columns of a round this reads (the rounds table). */
export interface SgRound {
  id: string
  holes_played: number
  fairways_pct: number | null
  gir_pct: number | null
  total_putts: number | null
  up_and_downs: number | null
  three_putts?: number | null
}

/** The columns of a hole this reads (the round_holes table). */
export interface SgHoleRow {
  hole_number: number
  par: number
  strokes: number
  putts: number | null
  fairway_hit: boolean | null
  green_hit: boolean | null
  penalty: boolean
  penalty_shot: PenaltyShot | null
  first_putt_ft?: number | null
  tracking?: HoleTracking | null
  wedge_in_hand?: boolean | null
  easy_updown_missed?: boolean | null
}

export interface SgContext {
  baseline: Baseline
  /** The bag's driver total (carry plus roll); null when the bag has no driver. */
  driverTotalYds: number | null
  /** A hole's yards, labelled by where they came from. */
  yardsFor(holeNumber: number, par: number): HoleYards
}

/** What a round's numbers came from: its holes' tracked shots, its holes' scorecard entries, or only its totals. */
export type SgRoundKind = "shots" | "scorecard" | "totals"

export interface RoundSgResult {
  roundId: string
  kind: SgRoundKind
  holes: HoleSg[]
  /** Strokes gained over the holes played; null for a round known only by its totals. */
  total: number | null
  /** The total scaled to 18 holes. */
  totalPer18: number | null
  /** Per category, scaled to 18 holes; null where the round has nothing to say (no putts entered, too few missed greens). */
  per18: Record<SgCategory, number | null>
  /** The category it did worst in (most negative, per 18), if any category has data. */
  weakest: SgCategory | null
  /** Holes read from tracked shots, and from the scorecard. */
  holesFromShots: number
  holesFromScorecard: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** +0.42 / –1.30 as golfers read it. */
export const formatSg = (n: number) => `${n > 0 ? "+" : n < 0 ? "–" : ""}${Math.abs(n).toFixed(2)}`

const nullCategories = (): Record<SgCategory, number | null> => ({ off_tee: null, approach: null, short_game: null, putting: null })

function weakestOf(per18: Record<SgCategory, number | null>): SgCategory | null {
  let worst: SgCategory | null = null
  for (const c of SG_CATEGORIES) {
    const v = per18[c]
    if (v != null && (worst == null || v < (per18[worst] as number))) worst = c
  }
  return worst
}

function fromTotals(round: SgRound): RoundSgResult {
  const per18 = nullCategories()
  const scale = 18 / Math.max(1, round.holes_played)
  for (const c of computeUserSg({
    holesPlayed: round.holes_played,
    fairwaysPct: round.fairways_pct,
    girPct: round.gir_pct,
    totalPutts: round.total_putts,
    upAndDowns: round.up_and_downs,
    teePenalties: 0,
  })) {
    per18[c.category] = round2(c.userSg * scale)
  }
  return { roundId: round.id, kind: "totals", holes: [], total: null, totalPer18: null, per18, weakest: weakestOf(per18), holesFromShots: 0, holesFromScorecard: 0 }
}

/**
 * One round's strokes gained against the context's baseline. `shots` are the
 * round's saved shots (any holes); only a hole whose tracking is complete uses
 * them, and only when they add up to its score.
 */
export function roundSg(round: SgRound, holes: readonly SgHoleRow[], shots: readonly RoundShot[], ctx: SgContext): RoundSgResult {
  if (holes.length === 0) return fromTotals(round)

  const results: HoleSg[] = []
  for (const h of [...holes].sort((a, b) => a.hole_number - b.hole_number)) {
    const tracked =
      h.tracking === "complete"
        ? shotHoleSg({ holeNumber: h.hole_number, par: h.par, strokes: h.strokes }, shots.filter((s) => s.holeNumber === h.hole_number), ctx.baseline)
        : null
    results.push(
      tracked ??
        estimateHoleSg(
          {
            holeNumber: h.hole_number,
            par: h.par,
            strokes: h.strokes,
            putts: h.putts,
            fairwayHit: h.fairway_hit,
            greenHit: h.green_hit,
            penalty: h.penalty,
            penaltyShot: h.penalty_shot,
            firstPuttFt: h.first_putt_ft ?? null,
          },
          { baseline: ctx.baseline, driverTotalYds: ctx.driverTotalYds, yards: ctx.yardsFor(h.hole_number, h.par) }
        )
    )
  }

  const total = results.reduce((n, r) => n + r.total, 0)
  const per18 = nullCategories()
  const split = results.filter((r) => r.categories != null)
  if (split.length > 0) {
    for (const c of SG_CATEGORIES) per18[c] = (split.reduce((n, r) => n + (r.categories as Record<SgCategory, number>)[c], 0) * 18) / split.length
  }
  const fromShots = results.filter((r) => r.source === "shots").length
  return {
    roundId: round.id,
    kind: fromShots > 0 ? "shots" : "scorecard",
    holes: results,
    total,
    totalPer18: (total * 18) / results.length,
    per18,
    weakest: weakestOf(per18),
    holesFromShots: fromShots,
    holesFromScorecard: results.length - fromShots,
  }
}

export interface CategoryAverage {
  category: SgCategory
  /** Average strokes gained per 18 holes over the rounds that have the category; null when none do. */
  perRound: number | null
  /** The value in each round that has it, in the order given. */
  rounds: { roundId: string; value: number }[]
}

export interface SgSummary {
  rounds: number
  /** How many of the rounds came from each source. */
  basis: Record<SgRoundKind, number>
  totalPerRound: number | null
  categories: CategoryAverage[]
}

const mean = (xs: readonly number[]): number | null => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** The rounds together: the four categories as strokes per round, and what the numbers rest on. */
export function summarizeRounds(results: readonly RoundSgResult[]): SgSummary {
  const basis: Record<SgRoundKind, number> = { shots: 0, scorecard: 0, totals: 0 }
  for (const r of results) basis[r.kind] += 1
  return {
    rounds: results.length,
    basis,
    totalPerRound: mean(results.flatMap((r) => (r.totalPer18 == null ? [] : [r.totalPer18]))),
    categories: SG_CATEGORIES.map((category) => {
      const rounds = results.flatMap((r) => (r.per18[category] == null ? [] : [{ roundId: r.roundId, value: r.per18[category] as number }]))
      return { category, perRound: mean(rounds.map((x) => x.value)), rounds }
    }),
  }
}

/** "10 rounds: 7 from your scorecard, 2 with tracked shots, 1 from round totals", leaving out what is zero. */
export function describeBasis(s: Pick<SgSummary, "rounds" | "basis">): string {
  const parts = [
    s.basis.scorecard > 0 ? `${s.basis.scorecard} from your scorecard` : null,
    s.basis.shots > 0 ? `${s.basis.shots} with tracked shots` : null,
    s.basis.totals > 0 ? `${s.basis.totals} from round totals` : null,
  ].filter(Boolean)
  return `${s.rounds} round${s.rounds === 1 ? "" : "s"}: ${parts.join(", ")}`
}

export interface CategoryLoss {
  category: SgCategory
  /** Strokes lost per round to this category (positive = lost, negative = gained). */
  strokesLost: number
  rounds: number
}

/** For the practice plan: strokes lost per round in each category that has data, in the usual order. */
export function categoryStrokesLostPerRound(results: readonly RoundSgResult[]): CategoryLoss[] {
  return summarizeRounds(results).categories.flatMap((c) =>
    c.perRound == null ? [] : [{ category: c.category, strokesLost: -c.perRound, rounds: c.rounds.length }]
  )
}
