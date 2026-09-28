// Score differential and handicap-index estimation.
//
// USGA differential formula is holes-agnostic: (score - courseRating) * 113 /
// slopeRating, no adjustment for 9 vs 18 holes. The rating/slope entered for a
// 9-hole round already reflect that shorter course, so the raw differential
// is already on the same scale as an 18-hole one -- it must never be scaled
// again by holes played.

export function calcDifferential(score: number, courseRating: number, slopeRating: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(courseRating) || !Number.isFinite(slopeRating) || slopeRating === 0) {
    return null
  }
  return Math.round(((score - courseRating) * 113 / slopeRating) * 10) / 10
}

/**
 * Simplified WHS-style handicap index: best 8 of up to the most recent 20
 * differentials, averaged, x0.96, truncated (not rounded) to one decimal.
 * `differentials` must be ordered most-recent-first; only the first 20 are
 * considered, matching the USGA "last 20 rounds" window. Returns null if
 * fewer than 8 differentials are available (not enough for a stable estimate).
 */
export function estimateHandicapIndex(differentials: number[]): number | null {
  const last20 = differentials.slice(0, 20)
  if (last20.length < 8) return null
  const best8 = [...last20].sort((a, b) => a - b).slice(0, 8)
  const raw = (best8.reduce((a, b) => a + b, 0) / 8) * 0.96
  return Math.trunc(raw * 10) / 10
}

/**
 * The handicap estimate as it stood after each round, for charting over time.
 * `differentials` is oldest-first, one entry per round (null = no rating/slope).
 * Each point uses only rounds up to and including that one, so it never
 * "knows" about later rounds; null until 8 rated rounds exist.
 */
export function rollingHandicapSeries(differentials: (number | null)[]): (number | null)[] {
  const seen: number[] = [] // rated differentials so far, oldest-first
  return differentials.map((d) => {
    if (d != null) seen.push(d)
    return estimateHandicapIndex(seen.slice(-20).reverse())
  })
}
