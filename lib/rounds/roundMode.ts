// Round mode: the Play page ("/") with a round going becomes one full-screen
// layout. Pausing leaves it for the normal app without ending the round; the
// pause lives in memory only, so reopening the app always lands back in it.

import { ACTIVE_ROUND_EVENT, staleness, type ActiveRound } from "./activeRound"

/** Phones, and a phone turned sideways. globals.css repeats this query (roundMode.test.ts keeps them equal). */
export const ROUND_COMPACT_QUERY = "(max-width: 767px), (max-height: 500px)"

/** html[data-round]: "1" in round mode, "resume" with a round going elsewhere or paused. */
export const ROUND_ATTR = "round"

export const ROUND_PAUSE_EVENT = "golfos:roundPause"

let paused = false

export function isRoundPaused(): boolean {
  return paused
}

export function setRoundPaused(next: boolean): void {
  if (paused === next) return
  paused = next
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ROUND_PAUSE_EVENT))
}

let claimedId: string | null = null

/** The golfer chose to finish an old round: from now on it counts as the round in progress. Memory only, so a reload asks again. */
export function claimOldRound(id: string): void {
  claimedId = id
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTIVE_ROUND_EVENT))
}

/** The stored round if it is in progress as far as the app is concerned: not abandoned, and not an old one nobody has picked yet. */
export function liveRound(round: ActiveRound | null, now = Date.now()): ActiveRound | null {
  if (!round) return null
  const s = staleness(round, now)
  return s === "fresh" || (s === "old" && round.id === claimedId) ? round : null
}

export function inRoundMode(round: ActiveRound | null, pathname: string, isPaused: boolean): boolean {
  return round != null && !isPaused && pathname === "/"
}
