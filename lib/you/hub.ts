// What the You hub shows beside each row, plus the small pure helpers behind
// the My bag screen. No math lives in the components.

import { badgeFor, type Badge } from "@/lib/golfer/shotProfile"
import type { Club } from "@/lib/golfer/tables"

const DAY_MS = 24 * 60 * 60 * 1000
/** "This week" on the Practice row: the last 7 days, not the calendar week. */
export const PRACTICE_WINDOW_DAYS = 7

/** A handicap index as golfers write it: plus handicaps get a "+". */
export function formatIndex(n: number): string {
  return n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1)
}

/** "2.4 index", or null when there is no index yet. */
export function statsValue(index: number | null): string | null {
  return index == null ? null : `${formatIndex(index)} index`
}

/** Drills finished in the last 7 days (an unfinished drill doesn't count). */
export function drillsThisWeek(runs: readonly { completed_at: string | null }[], now: number): number {
  return runs.filter((r) => {
    if (!r.completed_at) return false
    const age = now - new Date(r.completed_at).getTime()
    return age >= 0 && age <= PRACTICE_WINDOW_DAYS * DAY_MS
  }).length
}

/** "3 drills this week", "1 drill this week", or null for none (the row then shows no number). */
export function practiceValue(count: number): string | null {
  if (count <= 0) return null
  return `${count} drill${count === 1 ? "" : "s"} this week`
}

// ---- My bag: how much of the golfer's own shot data stands behind each club ----

/** A club from the golfer's own fitted profile (shot_profiles), reduced to what the bag shows. */
export interface FittedClub {
  club: Club
  meanCarryYds: number
  nShots: number
}

export interface BagRow {
  club: Club
  /** The golfer's carry in yards (fitted, else typed in setup), or null when neither exists. */
  carryYds: number | null
  /** Solid / OK / Thin from 13c's badgeFor; only for clubs with fitted shots. */
  badge: Badge | null
  nShots: number | null
}

/**
 * One row per club in the bag. A club with fitted shots shows its fitted carry
 * and the 13c badge; otherwise the carry typed in setup applies, with no badge.
 */
export function buildBagRows(args: {
  bag: readonly Club[]
  carries: Partial<Record<Club, number>>
  fitted: readonly FittedClub[] | null
}): BagRow[] {
  const byClub = new Map<Club, FittedClub>()
  for (const f of args.fitted ?? []) if (!byClub.has(f.club)) byClub.set(f.club, f)
  return args.bag.map((club) => {
    const f = byClub.get(club)
    if (f) return { club, carryYds: Math.round(f.meanCarryYds), badge: badgeFor(club, f.nShots), nShots: f.nShots }
    return { club, carryYds: args.carries[club] ?? null, badge: null, nShots: null }
  })
}

/** Where Edit/Save may send the golfer back to: an in-app path only. */
export function safeReturnPath(raw: string | null | undefined, fallback = "/you/bag"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback
  return raw
}
