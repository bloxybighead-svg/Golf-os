// The numbers My bag shows for each club: the same carries the planner decides
// from (lib/golfer/bagShots.ts builds both), where they come from, and any
// gapping problem between neighbouring clubs.

import { BASE_ROLL_YDS, clubGroup } from "@/lib/course/roll"
import { normalizeBag } from "@/lib/golfer/bag"
import { blendHandicapFor, fullBagShots, meanCarry } from "@/lib/golfer/bagShots"
import { generateMyBag, type ClubFit } from "@/lib/golfer/shotProfile"
import type { Club } from "@/lib/golfer/tables"

/** Two neighbouring clubs this close (or closer) carry about the same: one is redundant. The author's rule, 2026-10-12. */
export const CLOSE_GAP_YDS = 6
/** A gap bigger than this leaves a distance no club covers. The author's rule, 2026-10-12. */
export const WIDE_GAP_YDS = 20

export type CarrySource = "shots" | "typed" | "typical"

export interface BagNumber {
  club: Club
  carryYds: number
  /** Carry plus the planner's estimated fairway roll (only Driver and 3-Wood roll). */
  totalYds: number
  source: CarrySource
  /** Shots behind the number when source is "shots". */
  nShots: number | null
}

export function buildBagNumbers(args: {
  bag: Club[]
  /** The golfer's own fitted clubs; null to estimate from a handicap. */
  fits: ClubFit[] | null
  handicap: number
  /** The tracked or setup handicap the golfer's thin clubs blend toward, when there is one. */
  accountHandicap: number | null
  /** Carries typed by the golfer that the planner uses (bagShots.typedCarries). */
  typed: Partial<Record<Club, number>>
}): BagNumber[] {
  const myBag = args.fits ? generateMyBag(args.fits, args.bag, blendHandicapFor(args.accountHandicap, args.handicap), undefined, undefined, args.typed) : null
  const shots = fullBagShots({ myBag, handicap: args.handicap, typed: args.typed, bag: args.bag })
  const nByClub = new Map((args.fits ?? []).map((f) => [f.club, f.nShots]))
  const byClub = new Map(shots.map((c) => [c.club, c]))
  return normalizeBag(args.bag).flatMap((club) => {
    const c = byClub.get(club)
    if (!c) return []
    const carryYds = Math.round(meanCarry(c.shots))
    const n = nByClub.get(club)
    // Shots the golfer hit outrank a typed number, so a club with shots reads "Your shots" even when a number was typed.
    const source: CarrySource = n != null ? "shots" : args.typed[club] != null ? "typed" : "typical"
    return [{ club, carryYds, totalYds: carryYds + BASE_ROLL_YDS[clubGroup(club)], source, nShots: source === "shots" ? n! : null }]
  })
}

export function sourceLabel(row: Pick<BagNumber, "source" | "nShots">): string {
  if (row.source === "shots") return `Your shots (${row.nShots})`
  return row.source === "typed" ? "Your number" : "Typical"
}

export interface GapNote {
  /** The longer club of the pair; the note sits under it. */
  upper: Club
  lower: Club
  text: string
}

/** Pairs of neighbouring clubs, longest first, that are too close or too far apart. */
export function gapNotes(rows: readonly Pick<BagNumber, "club" | "carryYds">[]): GapNote[] {
  const notes: GapNote[] = []
  for (let i = 0; i < rows.length - 1; i++) {
    const [a, b] = [rows[i], rows[i + 1]]
    const gap = a.carryYds - b.carryYds
    if (gap < 0) notes.push({ upper: a.club, lower: b.club, text: `${b.club} carries past ${a.club}` })
    else if (gap <= CLOSE_GAP_YDS) notes.push({ upper: a.club, lower: b.club, text: `${gap} yd apart` })
    else if (gap > WIDE_GAP_YDS) notes.push({ upper: a.club, lower: b.club, text: `${gap} yd gap` })
  }
  return notes
}
