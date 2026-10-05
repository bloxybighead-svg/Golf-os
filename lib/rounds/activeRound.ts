// A round in progress, started from Play. It lives on the device until it's
// finished (so it survives the phone locking mid-round), then saves through
// the same createRound as the round form.

import type { CourseRef } from "@/lib/golfer/baseline"
import { blankHoles, type HoleEntry } from "./holes"

export const ACTIVE_ROUND_KEY = "golfos.activeRound.v1"

/** Tells the rest of the app (the update toast) that a round started, changed or ended. */
export const ACTIVE_ROUND_EVENT = "golfos:activeRound"

export interface ActiveRound {
  /**
   * Made on the phone when the round starts (a UUID), before any network call. It becomes
   * rounds.id, so a round that is sent twice after a dropped connection is still one round.
   */
  id: string
  course: CourseRef
  date: string // local YYYY-MM-DD the round started
  teeName: string | null
  /** The tee's 18-hole course rating and slope, null when the course has no tee data. */
  courseRating: number | null
  slopeRating: number | null
  startHole: number
  /** One entry per hole in play, in the order they're played. */
  holes: HoleEntry[]
}

/**
 * The hole numbers played, in order: `count` holes from `startHole`, wrapping
 * past the course's last hole back to 1 (9 holes from the 10th = 10..18; 12
 * from the 10th = 10..18, 1..3). Never more holes than the course has, so no
 * hole repeats.
 */
export function playOrder(startHole: number, count: number, courseHoles = 18): number[] {
  const total = Math.max(1, Math.min(18, Math.round(courseHoles)))
  const n = Math.max(1, Math.min(total, Math.round(count) || 1))
  const start = Math.max(1, Math.min(total, Math.round(startHole) || 1))
  return Array.from({ length: n }, (_, i) => ((start - 1 + i) % total) + 1)
}

/** "10-18" or, when the round wraps past the last hole, "10-18, 1-3". */
export function describeOrder(order: number[]): string {
  const runs: [number, number][] = []
  for (const n of order) {
    const last = runs[runs.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else runs.push([n, n])
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ")
}

/** Blank holes for the play order, with each hole's par where the course data has one. */
export function holesFor(order: number[], parByHole: Record<number, number | null | undefined> = {}): HoleEntry[] {
  return order.map((n) => {
    const par = parByHole[n]
    return { ...blankHoles(1, par != null && par >= 3 && par <= 6 ? par : 4)[0], hole_number: n }
  })
}

/**
 * Course rating for the holes actually played. Tee data only carries the
 * 18-hole rating, so a shorter round gets its share of it (half for 9). An
 * estimate: the real 9-hole ratings of a front and back nine differ a little.
 * The slope is used as is.
 */
export function ratingForHoles(courseRating18: number, holesPlayed: number): number {
  return Math.round(courseRating18 * (Math.min(holesPlayed, 18) / 18) * 10) / 10
}

/** A new round's identity. crypto.randomUUID needs a secure page (https or localhost), which the installed app always is. */
export function newRoundId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** The next hole to score: the first one without a score, or null when all are in. */
export function nextUnscored(round: ActiveRound): number | null {
  return round.holes.find((h) => h.strokes == null)?.hole_number ?? null
}

export function loadActiveRound(): ActiveRound | null {
  try {
    const r = JSON.parse(localStorage.getItem(ACTIVE_ROUND_KEY) ?? "null") as ActiveRound | null
    if (!r || typeof r.course?.id !== "string" || !Array.isArray(r.holes) || r.holes.length === 0) return null
    // A round started before rounds had ids gets one now (and keeps it: the next save writes it back).
    return typeof r.id === "string" && r.id ? r : { ...r, id: newRoundId() }
  } catch {
    return null
  }
}

export function saveActiveRound(round: ActiveRound | null): void {
  try {
    if (round) localStorage.setItem(ACTIVE_ROUND_KEY, JSON.stringify(round))
    else localStorage.removeItem(ACTIVE_ROUND_KEY)
  } catch {
    // Private mode or full storage: the round lasts as long as the page does.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTIVE_ROUND_EVENT))
}
