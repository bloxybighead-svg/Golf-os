// Tiger 5: five round-killing mistakes counted per round. One hole can trigger several.
//
//   par5_bogey   bogey or worse on a par 5
//   double       double bogey or worse
//   three_putt   three putts or more
//   wedge_bogey  bogey or worse with a 9-iron or less in hand
//   updown       a blown easy up-and-down
//
// Each item is a count, or null when the round cannot say (a hole with no putts entry, an untracked bogey
// with neither answer given). A null item is left out of the total, never counted as zero.

import { distanceYds, type LatLng } from "@/lib/course/geo"
import { canonicalClub } from "@/lib/golfer/bag"
import type { HoleTracking } from "./holeTracking"
import type { RoundShot } from "./shots"

export type Tiger5Item = "par5_bogey" | "double" | "three_putt" | "wedge_bogey" | "updown"
export const TIGER5_ITEMS: readonly Tiger5Item[] = ["par5_bogey", "double", "three_putt", "wedge_bogey", "updown"]

/** Clubs that count as "9-iron or less in hand" (a partial of a wedge is named like "PW 3/4" and maps to the wedge). */
const SHORT_CLUBS: ReadonlySet<string> = new Set(["9-Iron", "PW", "GW", "SW", "LW"])

/** A shot this close to the pin, from fairway or rough, is an easy up-and-down. From the spec. */
export const EASY_UPDOWN_YDS = 30
/** An easy up-and-down is blown when it takes more than this many strokes. From the spec. */
const UPDOWN_MAX_STROKES = 2

export interface Tiger5Hole {
  hole_number: number
  par: number
  strokes: number
  putts: number | null
  tracking?: HoleTracking | null
  wedge_in_hand?: boolean | null
  easy_updown_missed?: boolean | null
}

export interface Tiger5Round {
  holes: readonly Tiger5Hole[]
  /** The tracked shots of the round (any hole's; a hole uses its own only when its tracking is complete). */
  shots: readonly RoundShot[]
  /** The box-score count, used only when the round has no holes. */
  three_putts: number | null
}

export interface Tiger5Result {
  items: Record<Tiger5Item, number | null>
  /** Sum over the known items. */
  total: number
  known: number
}

type HoleFlags = Record<Tiger5Item, boolean | null>

function wedgeBogeyFromShots(shots: readonly RoundShot[]): boolean {
  return shots.some((s) => {
    const club = canonicalClub(s.club)
    return club != null && SHORT_CLUBS.has(club) && s.fromLie !== "green"
  })
}

/** Whether the tracked shots show an easy up-and-down that took more than two strokes; null when the pin is unknown. */
function updownFromShots(shots: readonly RoundShot[]): boolean | null {
  const sorted = [...shots].sort((a, b) => a.shotNumber - b.shotNumber)
  const last = sorted[sorted.length - 1]
  const pin: LatLng | null = last?.toLie === "holed" ? last.to : null
  if (!pin) return null
  return sorted.some((s, i) => {
    if (!s.from || (s.fromLie !== "fairway" && s.fromLie !== "rough") || distanceYds(s.from, pin) > EASY_UPDOWN_YDS) return false
    const strokes = sorted.slice(i).reduce((n, x) => n + 1 + x.penaltyStrokes, 0)
    return strokes > UPDOWN_MAX_STROKES
  })
}

function holeFlags(h: Tiger5Hole, shots: readonly RoundShot[]): HoleFlags {
  const bogey = h.strokes > h.par
  const mine = shots.filter((s) => s.holeNumber === h.hole_number)
  const tracked = h.tracking === "complete" && mine.length > 0
  // An answer is only asked for after a bogey or worse, so on a better score the answer is "no".
  const answer = (v: boolean | null | undefined) => (bogey ? (v ?? null) : false)
  return {
    par5_bogey: h.par === 5 && bogey,
    double: h.strokes >= h.par + 2,
    three_putt: h.putts == null ? null : h.putts >= 3,
    wedge_bogey: !bogey ? false : tracked ? wedgeBogeyFromShots(mine) : answer(h.wedge_in_hand),
    updown: tracked ? (updownFromShots(mine) ?? answer(h.easy_updown_missed)) : answer(h.easy_updown_missed),
  }
}

export function tiger5(round: Tiger5Round): Tiger5Result {
  const items = Object.fromEntries(TIGER5_ITEMS.map((i) => [i, null])) as Record<Tiger5Item, number | null>
  if (round.holes.length === 0) {
    items.three_putt = round.three_putts
  } else {
    const flags = round.holes.map((h) => holeFlags(h, round.shots))
    for (const item of TIGER5_ITEMS) {
      const column = flags.map((f) => f[item])
      items[item] = column.some((v) => v == null) ? null : column.filter(Boolean).length
    }
  }
  const counts = TIGER5_ITEMS.map((i) => items[i]).filter((v): v is number => v != null)
  return { items, total: counts.reduce((a, b) => a + b, 0), known: counts.length }
}

export const TIGER5_LABEL: Record<Tiger5Item, { one: string; many: string }> = {
  par5_bogey: { one: "par-5 bogey", many: "par-5 bogeys" },
  double: { one: "double", many: "doubles" },
  three_putt: { one: "three-putt", many: "three-putts" },
  wedge_bogey: { one: "wedge bogey", many: "wedge bogeys" },
  updown: { one: "blown up-and-down", many: "blown up-and-downs" },
}

export type PressureArea = "lag_putting" | "short_putting" | "short_game" | "wedges" | "approach" | "tee"

/** Which practice areas each mistake points at. Doubles are an on-course decision, not a drill. From the spec. */
const AREAS: Record<Tiger5Item, readonly PressureArea[]> = {
  par5_bogey: ["wedges", "tee"],
  double: [],
  three_putt: ["lag_putting"],
  wedge_bogey: ["wedges", "short_putting"],
  updown: ["short_game", "short_putting"],
}

/**
 * Mistakes per round pointing at each practice area: each mistake weighs 1 in its areas, and an item is averaged
 * over the rounds where it is known (an item no round knows adds nothing).
 */
export function tiger5Pressure(rounds: readonly Tiger5Round[]): Record<PressureArea, number> {
  const out: Record<PressureArea, number> = { lag_putting: 0, short_putting: 0, short_game: 0, wedges: 0, approach: 0, tee: 0 }
  const results = rounds.map(tiger5)
  for (const item of TIGER5_ITEMS) {
    const known = results.map((r) => r.items[item]).filter((v): v is number => v != null)
    if (known.length === 0) continue
    const perRound = known.reduce((a, b) => a + b, 0) / known.length
    for (const area of AREAS[item]) out[area] += perRound
  }
  return out
}

export interface Tiger5ItemSummary {
  item: Tiger5Item
  /** Mistakes per 18 holes over the rounds that know the item; null when none do. */
  per18: number | null
  /** Mistakes over those rounds, and how many rounds they are. */
  count: number
  rounds: number
}

export interface Tiger5Summary {
  rounds: number
  items: Tiger5ItemSummary[]
  /** Sum of the known items' per-18 rates; null when no item is known. */
  per18: number | null
  /** The known item that happens most, or null when none happened. */
  most: Tiger5Item | null
}

export function summarizeTiger5(rounds: readonly { holesPlayed: number; result: Tiger5Result }[]): Tiger5Summary {
  const items = TIGER5_ITEMS.map((item): Tiger5ItemSummary => {
    const known = rounds.filter((r) => r.result.items[item] != null)
    const count = known.reduce((n, r) => n + (r.result.items[item] ?? 0), 0)
    const holes = known.reduce((n, r) => n + r.holesPlayed, 0)
    return { item, per18: holes > 0 ? (count / holes) * 18 : null, count, rounds: known.length }
  })
  const rates = items.map((i) => i.per18).filter((v): v is number => v != null)
  const top = items.reduce<Tiger5ItemSummary | null>((best, i) => ((i.per18 ?? 0) > (best?.per18 ?? 0) ? i : best), null)
  return { rounds: rounds.length, items, per18: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) : null, most: top?.item ?? null }
}
