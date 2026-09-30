// Deciding whether a GPS reading is good enough to move the ball. Phones
// report fixes that are tens of yards out (under trees, just after waking)
// and the occasional jump of hundreds of yards; applying those straight to
// the ball sends the yardages somewhere else entirely.

import { distanceYds, type LatLng } from "./geo"

export interface GpsFix extends LatLng {
  accuracyYds: number // the phone's own radius for this reading (68% confidence)
  t: number // ms
}

/** A reading less precise than this doesn't move the ball. */
export const MAX_ACCURACY_YDS = 20

/**
 * The fastest the ball can plausibly travel between fixes: a golf cart's top
 * speed (~15 mph = 7.3 yd/s), not a walk, since most golfers ride. A glitch
 * jump is hundreds of yards in a couple of seconds, far past either.
 */
export const MAX_SPEED_YDS_PER_S = 7.5

export type GpsVerdict = "accept" | "inaccurate" | "jump"

/** A jump must hold steady this long before it's believed. */
export const JUMP_CONFIRM_MS = 3000

export interface GpsTrack {
  /** The last reading that moved the ball (null before the first). */
  accepted: GpsFix | null
  /** Where an unexplained jump first landed, while waiting to see if it holds. */
  jump: GpsFix | null
}

export const EMPTY_TRACK: GpsTrack = { accepted: null, jump: null }

const agrees = (a: GpsFix, b: GpsFix) => distanceYds(a, b) <= a.accuracyYds + b.accuracyYds

/**
 * Whether `next` can move the ball, and the track to judge the one after it
 * by. A move is allowed as far as cart speed covers in the time since the
 * last accepted reading, plus both readings' error radii. A move beyond that
 * is a jump; it's believed only once readings have stayed at the new place
 * for 3 s (the golfer really is somewhere new -- the phone slept through the
 * drive to the next tee), not for a one-off glitch.
 */
export function judgeFix(track: GpsTrack, next: GpsFix): { verdict: GpsVerdict; track: GpsTrack } {
  if (!(next.accuracyYds <= MAX_ACCURACY_YDS)) return { verdict: "inaccurate", track }
  const accept = { verdict: "accept" as const, track: { accepted: next, jump: null } }
  const last = track.accepted
  if (!last) return accept
  const seconds = Math.max(0, (next.t - last.t) / 1000)
  if (distanceYds(last, next) <= MAX_SPEED_YDS_PER_S * seconds + last.accuracyYds + next.accuracyYds) return accept
  if (track.jump && agrees(track.jump, next)) {
    return next.t - track.jump.t >= JUMP_CONFIRM_MS ? accept : { verdict: "jump", track }
  }
  return { verdict: "jump", track: { accepted: last, jump: next } }
}
