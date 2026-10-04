// When a club the golfer picked (instead of "auto", the best club) holds.
// A pick is for THIS shot: it holds until the ball is carried to the next shot
// (NEW_SHOT_YDS from where it was picked), the hole actually changes, the golfer
// taps "Back to best club", or the club leaves the bag. GPS jitter, small ball
// nudges, course data refreshes and re-rankings never reset it.

import type { OptimizedClubPlan } from "@/lib/course/plan"
import { distanceYds } from "@/lib/course/geo"
import type { LatLng } from "@/lib/course/geo"

export type ClubChoice = "auto" | string

/** After picking a hole: a different hole starts on "auto"; the same hole keeps the pick. */
export function choiceAfterHolePick(choice: ClubChoice, currentHoleId: string | null, nextHoleId: string): ClubChoice {
  return nextHoleId === currentHoleId ? choice : "auto"
}

/** A picked club that is no longer in the bag (or the shot source changed) goes back to "auto". */
export function choiceInBag(choice: ClubChoice, clubsInBag: string[]): ClubChoice {
  if (choice === "auto" || clubsInBag.length === 0) return choice
  return clubsInBag.includes(choice) ? choice : "auto"
}

/**
 * The plan to show for the chosen club. While a new ranking is being worked
 * out (or a fresh one doesn't list the club yet) the picked club's last plan
 * keeps showing, instead of jumping to the best club.
 */
export function chosenPlan(
  ranking: OptimizedClubPlan[],
  choice: ClubChoice,
  previous: OptimizedClubPlan | null
): OptimizedClubPlan | null {
  const best = ranking[0] ?? null
  if (choice === "auto") return best
  return ranking.find((r) => r.club === choice) ?? (previous?.club === choice ? previous : best)
}

/** How long map taps are ignored after the club sheet closes, so the closing tap can't land on the map. */
export const MAP_TAP_GUARD_MS = 350

/** Ball moved this far (yd) from where a club was picked = the golfer walked to the next shot. Estimate: GPS jitter and nudges are well under it, the shortest real next shot is well over. */
export const NEW_SHOT_YDS = 30

/** A pick goes back to "auto" once the ball is NEW_SHOT_YDS or more from where it was picked. */
export function choiceAfterBallMove(choice: ClubChoice, pickedAt: LatLng | null, ball: LatLng | null): ClubChoice {
  if (choice === "auto" || !pickedAt || !ball) return choice
  return distanceYds(pickedAt, ball) > NEW_SHOT_YDS ? "auto" : choice
}
