// Score differential and handicap-index estimation.
//
// Differential = (score - courseRating) * 113 / slopeRating, with the rating
// for the holes actually played (a 9-hole rating for 9 holes). That number is
// only about half as big for 9 holes as for 18, so a shorter round is scaled
// up to an 18-hole differential (x 18 / holes played) before it's saved --
// otherwise 9-hole rounds would sit next to 18-hole ones in the best-8-of-20
// and drag the estimate down. (Dillon's call, 2026-09-30. Official WHS
// instead adds an expected 9-hole differential from the golfer's index; a
// straight scale needs no index and treats both nines the same.) Rounds of
// fewer than 9 holes get no differential, as under WHS.

export const MIN_HOLES_FOR_DIFFERENTIAL = 9

export function calcDifferential(score: number, courseRating: number, slopeRating: number, holesPlayed = 18): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(courseRating) || !Number.isFinite(slopeRating) || slopeRating === 0) {
    return null
  }
  if (!Number.isFinite(holesPlayed) || holesPlayed < MIN_HOLES_FOR_DIFFERENTIAL) return null
  const toEighteen = 18 / Math.min(holesPlayed, 18)
  return Math.round(((score - courseRating) * 113 / slopeRating) * toEighteen * 10) / 10
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
