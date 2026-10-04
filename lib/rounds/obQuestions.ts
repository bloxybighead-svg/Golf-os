// After a round: for each hole where the golfer said the penalty came off the
// tee, ask once "Was it OB left or right?" so the answer can become an OB tag
// for that hole (lib/planner/obTagStore.ts). A hole whose OB the golfer has
// already answered is not asked about again.

import type { HoleEntry } from "./holes"

/** The hole numbers to ask about: a tee-shot penalty on a hole with no OB answer yet, in play order. */
export function holesToAskAboutOb(holes: readonly Pick<HoleEntry, "hole_number" | "penalty" | "penalty_shot">[], alreadyAnswered: (holeNumber: number) => boolean): number[] {
  return holes.filter((h) => h.penalty && h.penalty_shot === "tee" && !alreadyAnswered(h.hole_number)).map((h) => h.hole_number)
}
