// "On hole 8?": when the golfer's GPS has sat at the next hole's tee while the hole just played is
// scored, Play offers to move there. An offer only, never a switch.

import { distanceYds, type LatLng } from "@/lib/course/geo"
import type { ActiveRound } from "./activeRound"

/** How near the next tee counts as being at it (yards). */
export const OFFER_RADIUS_YDS = 30
/** How long the golfer has to stay that near before the offer shows (ms). */
export const OFFER_DWELL_MS = 20_000

/** When the golfer got within the radius, kept while they stay in; null as soon as they leave. */
export function trackDwell(since: number | null, within: boolean, t: number): number | null {
  return within ? (since ?? t) : null
}

export function withinOfferRadius(fix: LatLng, tee: LatLng): boolean {
  return distanceYds(fix, tee) <= OFFER_RADIUS_YDS
}

/**
 * The hole to offer next: the one after the map's hole in the round's order, with the tee the map puts
 * the ball on. Null until the map's hole is scored, on the round's last hole, or when the map has no
 * line for the next hole.
 */
export function nextHoleTarget(
  round: ActiveRound | null,
  currentRef: number | null,
  holes: { ref: number | null; line: LatLng[] }[]
): { holeNumber: number; tee: LatLng } | null {
  if (!round || currentRef == null) return null
  const at = round.holes.findIndex((h) => h.hole_number === currentRef)
  if (at < 0 || round.holes[at].strokes == null) return null
  const next = round.holes[at + 1]
  const tee = next && holes.find((h) => h.ref === next.hole_number)?.line[0]
  return next && tee ? { holeNumber: next.hole_number, tee } : null
}
