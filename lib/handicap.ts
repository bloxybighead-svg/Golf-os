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
 * Whether a freshly calculated index should be written to handicap_tracking.
 * Rounds recalculate on every save, so this keeps the history to real changes:
 * skip when there's no index yet (fewer than 8 rated rounds) or when the latest
 * entry is already a calculated one with the same value. A newer calculation
 * does replace a manual entry as the current index.
 */
export function needsNewCalculatedEntry(
  latest: { source: string; handicap_index: number | string } | null,
  index: number | null
): boolean {
  if (index == null) return false
  if (!latest) return true
  return !(latest.source === "calculated" && Number(latest.handicap_index) === index)
}
