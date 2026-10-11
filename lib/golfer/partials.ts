// Partial wedge swings (3/4 and 1/2 of PW, GW, SW, LW), derived from the full
// club's own shots so the planner can plan 40-120 yd shots and lay-ups.

import type { ShotXY } from "./bag"

export const PARTIAL_WEDGES = ["PW", "GW", "SW", "LW"] as const
export const SWING_LENGTHS = ["3/4", "1/2"] as const
export type PartialWedge = (typeof PARTIAL_WEDGES)[number]
export type SwingLength = (typeof SWING_LENGTHS)[number]
export type PartialName = `${PartialWedge} ${SwingLength}`

/** Share of the full club's carry a partial swing goes. ESTIMATE: typical amateur wedge numbers; the golfer can type their own. */
export const PARTIAL_CARRY_RATIO: Record<SwingLength, number> = { "3/4": 0.85, "1/2": 0.65 }

/** A partial's carry spread relative to the (ratio-scaled) full swing's. ESTIMATE: partials are more repeatable in distance. */
export const PARTIAL_SPREAD_SCALE = 0.8

/** Partials are ranked only inside the full PW's reach plus this many yards. */
const PARTIAL_RANGE_MARGIN_YDS = 10

/** Typed carries outside this are ignored: a half-typed number must not warp the bag. */
const MIN_TYPED_CARRY_YDS = 10
const MAX_TYPED_CARRY_YDS = 200

interface ClubShotsLike {
  club: string
  shots: ShotXY[]
}

export const partialName = (club: PartialWedge, length: SwingLength): PartialName => `${club} ${length}`

const PARTIAL_PATTERN = /^(PW|GW|SW|LW) (3\/4|1\/2)$/

/** The full club and swing length a partial's name means, or null for a full club. */
export function parsePartial(name: string): { club: PartialWedge; length: SwingLength } | null {
  const m = PARTIAL_PATTERN.exec(name)
  return m ? { club: m[1] as PartialWedge, length: m[2] as SwingLength } : null
}

const meanCarry = (shots: readonly ShotXY[]) => shots.reduce((a, s) => a + s.carryYds, 0) / shots.length

/**
 * A partial's shots from the full club's: carry and offline scaled by the
 * ratio, the carry spread by PARTIAL_SPREAD_SCALE more. A typed carry
 * replaces the mean and keeps the derived spread.
 */
export function derivePartial(full: readonly ShotXY[], length: SwingLength, typedCarry?: number): ShotXY[] {
  const ratio = PARTIAL_CARRY_RATIO[length]
  const mean = meanCarry(full)
  const target = typedCarry ?? mean * ratio
  return full.map((s) => ({
    carryYds: target + (s.carryYds - mean) * ratio * PARTIAL_SPREAD_SCALE,
    offlineYds: s.offlineYds * ratio,
  }))
}

/** The bag's clubs followed by a 3/4 and a 1/2 swing for each full wedge in it. */
export function withPartials(clubs: readonly ClubShotsLike[], typed: Partial<Record<string, number>>): ClubShotsLike[] {
  const out: ClubShotsLike[] = [...clubs]
  for (const c of clubs) {
    if (c.shots.length === 0 || !(PARTIAL_WEDGES as readonly string[]).includes(c.club)) continue
    for (const length of SWING_LENGTHS) {
      const name = partialName(c.club as PartialWedge, length)
      out.push({ club: name, shots: derivePartial(c.shots, length, typed[name]) })
    }
  }
  return out
}

/**
 * Where partials stop being worth ranking: the full PW's carry plus
 * PARTIAL_RANGE_MARGIN_YDS (wedges do not roll, so carry is its total). With
 * no PW in the bag, the longest full wedge stands in. Null with no wedge.
 */
function partialCutoffYds(clubs: readonly ClubShotsLike[]): number | null {
  const wedges = clubs.filter((c) => c.shots.length > 0 && (PARTIAL_WEDGES as readonly string[]).includes(c.club))
  if (wedges.length === 0) return null
  const pw = wedges.find((c) => c.club === "PW")
  const reach = pw ? meanCarry(pw.shots) : Math.max(...wedges.map((c) => meanCarry(c.shots)))
  return reach + PARTIAL_RANGE_MARGIN_YDS
}

/** The clubs to rank from `toPinYds` out: partials only inside partialCutoffYds. */
export function clubsForDistance<T extends ClubShotsLike>(clubs: readonly T[], toPinYds: number): T[] {
  const cutoff = partialCutoffYds(clubs)
  return clubs.filter((c) => parsePartial(c.club) === null || (cutoff !== null && toPinYds < cutoff))
}

/** Typed partial carries from untrusted storage: known names with a sensible number. */
export function cleanWedgeCarries(raw: unknown): Partial<Record<PartialName, number>> {
  const out: Partial<Record<PartialName, number>> = {}
  if (!raw || typeof raw !== "object") return out
  for (const w of PARTIAL_WEDGES) {
    for (const l of SWING_LENGTHS) {
      const name = partialName(w, l)
      const v = Number((raw as Record<string, unknown>)[name])
      if (Number.isFinite(v) && v >= MIN_TYPED_CARRY_YDS && v <= MAX_TYPED_CARRY_YDS) out[name] = Math.round(v)
    }
  }
  return out
}
