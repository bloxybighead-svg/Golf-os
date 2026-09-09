// Small seeded RNG for reproducible browser-side shot generation. Doesn't
// need to bit-match numpy's PCG64 -- just needs statistically correct
// uniform and normal distributions, which mulberry32 + Box-Muller give.

export type Rng = () => number

export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randUniform(rng: Rng): number {
  return rng()
}

export function randNormal(rng: Rng, mean = 0, sd = 1): number {
  const u1 = rng() || 1e-9
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * sd
}

export function randChoice<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]
}
