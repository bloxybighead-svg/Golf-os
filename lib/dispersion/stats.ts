// Summary stats for a set of shots -- shared by the comparison table and
// the sample-size convergence table. Percentile uses linear interpolation
// to match Postgres's percentile_cont, which the Supabase views
// (club_dispersion) already use -- so numbers here and in SQL agree.

export interface StatShot {
  carryYds: number
  offlineYds: number
}

export interface DispersionStats {
  n: number
  carryMean: number
  carrySd: number
  carryP10: number
  carryP50: number
  carryP90: number
  offlineMean: number
  offlineSd: number
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function sampleSd(values: number[], m: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function percentileContinuous(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = p * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const frac = idx - lo
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac
}

export function computeDispersionStats(shots: StatShot[]): DispersionStats {
  const carries = shots.map((s) => s.carryYds).sort((a, b) => a - b)
  const offlines = shots.map((s) => s.offlineYds)
  const carryMean = mean(carries)
  const offlineMean = mean(offlines)
  return {
    n: shots.length,
    carryMean,
    carrySd: sampleSd(carries, carryMean),
    carryP10: percentileContinuous(carries, 0.1),
    carryP50: percentileContinuous(carries, 0.5),
    carryP90: percentileContinuous(carries, 0.9),
    offlineMean,
    offlineSd: sampleSd(offlines, offlineMean),
  }
}

/** A seeded random-number generator in [0, 1): the same seed always gives the same sequence. */
export function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/** Deterministic subsample (first N after a seeded shuffle) so re-renders are stable. */
export function seededSample<T>(items: T[], n: number, seed: number): T[] {
  const arr = items.slice()
  const rng = seededRng(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, Math.min(n, arr.length))
}
