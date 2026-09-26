// Ported from SyntheticGolfer.from_handicap / from_handicap_and_carries.

import { generateShots, type GeneratedShot, type GolferConfig } from "./generate"
import {
  biasMeanForHandicap,
  biasSdForHandicap,
  mishitRateForHandicap,
  profilesForHandicap,
  scaleProfilesToCarries,
  type Club,
} from "./tables"

// A golfer's own miss pattern, on top of what their handicap implies.
// "auto" leaves the handicap average in place (a random per-golfer lean whose
// size grows with handicap); every other choice pins the average start-line
// bias. Positive degrees = right of target, negative = left.
export type TendencySide = "auto" | "straight" | "left" | "right" | "both"
export type TendencyStrength = "slight" | "moderate" | "strong"

export interface Tendency {
  side: TendencySide
  strength: TendencyStrength
}

// Roughly 1.8 / 3.5 / 7 yd of offline per 100 yd of carry. Judgement values,
// not measured: a real golfer's number should come from their own launch-monitor data.
export const TENDENCY_DEG: Record<TendencyStrength, number> = { slight: 0.5, moderate: 1.0, strong: 2.0 }
const STATED_TENDENCY_SD_DEG = 0.3 // when the golfer states their lean, they know it: little left over uncertainty

export interface CustomGolferInput {
  handicapIndex: number
  knownCarries?: Partial<Record<Club, number>> // e.g. { Driver: 250, "7-Iron": 155 }
  tendency?: Tendency
}

function tendencyOverrides(t?: Tendency): Partial<GolferConfig> {
  if (!t || t.side === "auto") return {}
  const deg = TENDENCY_DEG[t.strength]
  switch (t.side) {
    case "straight":
      return { biasMeanDeg: 0, biasSdDeg: STATED_TENDENCY_SD_DEG }
    case "left":
      return { biasMeanDeg: -deg, biasSdDeg: STATED_TENDENCY_SD_DEG }
    case "right":
      return { biasMeanDeg: deg, biasSdDeg: STATED_TENDENCY_SD_DEG }
    case "both":
      return { biasMeanDeg: deg, biasSdDeg: STATED_TENDENCY_SD_DEG, twoWayMiss: true }
  }
}

export function buildGolferConfig({ handicapIndex, knownCarries, tendency }: CustomGolferInput): GolferConfig {
  let profiles = profilesForHandicap(handicapIndex)
  if (knownCarries && Object.keys(knownCarries).length > 0) {
    profiles = scaleProfilesToCarries(profiles, knownCarries)
  }
  return {
    clubProfiles: profiles,
    biasSdDeg: biasSdForHandicap(handicapIndex),
    biasMeanDeg: biasMeanForHandicap(handicapIndex),
    mishitRate: mishitRateForHandicap(handicapIndex),
    ...tendencyOverrides(tendency),
  }
}

export function generateCustomGolferShots(
  input: CustomGolferInput,
  nShots: number,
  seed: number,
  clubs?: Club[]
): GeneratedShot[] {
  return generateShots(buildGolferConfig(input), nShots, seed, clubs)
}
