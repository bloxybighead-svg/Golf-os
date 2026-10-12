// Round mode: the Play page ("/") with a round going becomes one full-screen
// layout. Pausing leaves it for the normal app without ending the round; the
// pause lives in memory only, so reopening the app always lands back in it.

import type { ActiveRound } from "./activeRound"

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

export function inRoundMode(round: ActiveRound | null, pathname: string, isPaused: boolean): boolean {
  return round != null && !isPaused && pathname === "/"
}
