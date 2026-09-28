// A golfer's bag: which clubs the planner scores. Any club in the catalog can
// be in or out, so the defaults below are just starting points.

import { BAG_ORDER, referenceCarry, type Club } from "./tables"

export const CLUB_CATALOG: readonly Club[] = BAG_ORDER

/** New golfers: driver, 3-wood, 5- through 9-iron and four wedges. */
export const DEFAULT_BAG: Club[] = ["Driver", "3-Wood", "5-Iron", "6-Iron", "7-Iron", "8-Iron", "9-Iron", "PW", "GW", "SW", "LW"]

/** Dillon's bag (the calibrated golfer): driver, 3- and 7-wood, 4- through 9-iron and four wedges. */
export const CALIBRATED_DEFAULT_BAG: Club[] = [
  "Driver", "3-Wood", "7-Wood", "4-Iron", "5-Iron", "6-Iron", "7-Iron", "8-Iron", "9-Iron", "PW", "GW", "SW", "LW",
]

/** Maps a stored club name onto the catalog: "56 (SW)" -> "SW", "60 (LW)" -> "LW". */
export function canonicalClub(name: string): Club | null {
  if ((BAG_ORDER as readonly string[]).includes(name)) return name as Club
  const wedge = name.match(/\b(PW|GW|SW|LW)\b/)
  return wedge ? (wedge[1] as Club) : null
}

/** Keeps only catalog clubs, once each, in bag order (longest first). */
export function normalizeBag(clubs: readonly string[]): Club[] {
  const set = new Set(clubs)
  return BAG_ORDER.filter((c) => set.has(c))
}

export interface ShotXY {
  carryYds: number
  offlineYds: number
}

export interface BagClub {
  club: string // display name: the golfer's own label when measured ("56 (SW)"), else the catalog name
  shots: ShotXY[]
  /** Set when there was no data for this club: the club its shots were scaled from. */
  estimatedFrom?: string
}

/**
 * The golfer's measured clubs, filtered to their bag. A bag club with no
 * measured shots is estimated from the golfer's own nearest measured club
 * (by typical carry), with every shot scaled by the typical carry ratio
 * between the two -- carry and offline alike, so the miss angle, and so the
 * golfer's own shape, carries over. E.g. a missing 9-iron comes from the
 * 8-iron scaled by about 0.93.
 */
export function fillBag(measured: { club: string; shots: ShotXY[] }[], bag: readonly Club[]): BagClub[] {
  const byClub = new Map<Club, { club: string; shots: ShotXY[] }>()
  for (const m of measured) {
    const c = canonicalClub(m.club)
    if (c && m.shots.length > 0 && !byClub.has(c)) byClub.set(c, m)
  }
  if (byClub.size === 0) return []

  const out: BagClub[] = []
  for (const club of normalizeBag(bag)) {
    const have = byClub.get(club)
    if (have) {
      out.push({ club: have.club, shots: have.shots })
      continue
    }
    let from: Club | null = null
    let bestGap = Infinity
    for (const c of Array.from(byClub.keys())) {
      const gap = Math.abs(referenceCarry(c) - referenceCarry(club))
      if (gap < bestGap) {
        bestGap = gap
        from = c
      }
    }
    const source = byClub.get(from!)!
    const r = referenceCarry(club) / referenceCarry(from!)
    out.push({
      club,
      shots: source.shots.map((s) => ({ carryYds: s.carryYds * r, offlineYds: s.offlineYds * r })),
      estimatedFrom: source.club,
    })
  }
  return out
}
