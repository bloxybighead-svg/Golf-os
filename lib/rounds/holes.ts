// Hole-by-hole scoring (round_holes) and the round summary computed from it.
// The summary fills the same Round columns the percentage fields used to
// (fairways_pct, gir_pct, miss_left_pct, ...), so Rounds, Trends, You and the
// strokes-gained proxies read exactly what they did before.

export type FairwayMiss = "left" | "right"
export type GreenMiss = "left" | "right" | "long" | "short"

export const FAIRWAY_MISSES: readonly FairwayMiss[] = ["left", "right"]
export const GREEN_MISSES: readonly GreenMiss[] = ["left", "right", "long", "short"]

export interface HoleEntry {
  hole_number: number
  par: number
  strokes: number | null // null until the hole is scored
  fairway_hit: boolean | null // null on par 3s, or not recorded
  fairway_miss_side: FairwayMiss | null
  green_hit: boolean | null // null when not recorded
  green_miss_side: GreenMiss | null
  putts: number | null
  penalty: boolean
}

/** A hole that has a score, ready to save. */
export type ScoredHole = HoleEntry & { strokes: number }

export function blankHoles(count: number, par = 4): HoleEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    hole_number: i + 1,
    par,
    strokes: null,
    fairway_hit: null,
    fairway_miss_side: null,
    green_hit: null,
    green_miss_side: null,
    putts: null,
    penalty: false,
  }))
}

function intIn(v: unknown, lo: number, hi: number): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null
}

/**
 * Validates holes from the client: one per hole number (1-18), a par of 3-6
 * and a score. A par 3 never has a fairway; a miss side only goes with a
 * miss; putts can't exceed the score. Throws on anything unusable.
 */
export function cleanHoles(raw: unknown): ScoredHole[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 18) throw new Error("A round needs 1 to 18 holes.")
  const seen = new Set<number>()
  const out = raw.map((h): ScoredHole => {
    const hole_number = intIn(h?.hole_number, 1, 18)
    if (hole_number == null || seen.has(hole_number)) throw new Error("Hole numbers must be 1-18, once each.")
    seen.add(hole_number)
    const par = intIn(h.par, 3, 6)
    if (par == null) throw new Error(`Hole ${hole_number} needs a par of 3 to 6.`)
    const strokes = intIn(h.strokes, 1, 20)
    if (strokes == null) throw new Error(`Hole ${hole_number} needs a score.`)
    const putts = h.putts == null ? null : intIn(h.putts, 0, Math.min(strokes, 10))
    if (h.putts != null && putts == null) throw new Error(`Hole ${hole_number}: more putts than strokes.`)

    const fairway_hit = par === 3 || typeof h.fairway_hit !== "boolean" ? null : h.fairway_hit
    const fairway_miss_side =
      fairway_hit === false && FAIRWAY_MISSES.includes(h.fairway_miss_side) ? (h.fairway_miss_side as FairwayMiss) : null
    const green_hit = typeof h.green_hit === "boolean" ? h.green_hit : null
    const green_miss_side =
      green_hit === false && GREEN_MISSES.includes(h.green_miss_side) ? (h.green_miss_side as GreenMiss) : null

    return { hole_number, par, strokes, fairway_hit, fairway_miss_side, green_hit, green_miss_side, putts, penalty: h.penalty === true }
  })
  return out.sort((a, b) => a.hole_number - b.hole_number)
}

export interface HoleSummary {
  holes_played: number
  score: number
  par: number
  fairways_pct: number | null
  miss_left_pct: number | null
  miss_right_pct: number | null
  gir_pct: number | null
  total_putts: number | null
  three_putts: number | null
  up_and_downs: number | null
  /** Missed greens: the chances to get up and down. */
  up_and_down_chances: number
  up_and_down_pct: number | null
  penalties: number
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)

/**
 * The round's summary from its holes. Each percentage counts only the holes
 * where it was recorded: fairways (and the left/right misses, as a share of
 * all tee shots, the way GHIN shows them) over par 4s and 5s with a fairway
 * tap, GIR over holes with a green tap. Up and down = a missed green that
 * still made par or better, over all missed greens. Total putts only when
 * every hole has them, so a partial count never reads as a great round.
 */
export function summarizeHoles(holes: readonly ScoredHole[]): HoleSummary {
  const fairways = holes.filter((h) => h.fairway_hit != null)
  const greens = holes.filter((h) => h.green_hit != null)
  const missedGreens = greens.filter((h) => h.green_hit === false)
  const allPutts = holes.length > 0 && holes.every((h) => h.putts != null)
  const upAndDowns = missedGreens.filter((h) => h.strokes <= h.par).length

  return {
    holes_played: holes.length,
    score: holes.reduce((a, h) => a + h.strokes, 0),
    par: holes.reduce((a, h) => a + h.par, 0),
    fairways_pct: pct(fairways.filter((h) => h.fairway_hit).length, fairways.length),
    miss_left_pct: pct(fairways.filter((h) => h.fairway_miss_side === "left").length, fairways.length),
    miss_right_pct: pct(fairways.filter((h) => h.fairway_miss_side === "right").length, fairways.length),
    gir_pct: pct(greens.filter((h) => h.green_hit).length, greens.length),
    total_putts: allPutts ? holes.reduce((a, h) => a + (h.putts ?? 0), 0) : null,
    three_putts: allPutts ? holes.filter((h) => (h.putts ?? 0) >= 3).length : null,
    up_and_downs: greens.length > 0 ? upAndDowns : null,
    up_and_down_chances: missedGreens.length,
    up_and_down_pct: pct(upAndDowns, missedGreens.length),
    penalties: holes.filter((h) => h.penalty).length,
  }
}

/**
 * Up-and-down % for a saved round, from its up_and_downs count and the missed
 * greens implied by its GIR % (how the short-game proxy reads it too).
 */
export function upAndDownPct(r: { up_and_downs: number | null; gir_pct: number | null; holes_played: number }): number | null {
  if (r.up_and_downs == null || r.gir_pct == null) return null
  const missed = Math.round(r.holes_played * (1 - r.gir_pct / 100))
  return missed > 0 ? Math.round((Math.min(r.up_and_downs, missed) / missed) * 100) : null
}
