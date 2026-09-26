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

export interface CustomGolferInput {
  handicapIndex: number
  knownCarries?: Partial<Record<Club, number>> // e.g. { Driver: 250, "7-Iron": 155 }
}

export function buildGolferConfig({ handicapIndex, knownCarries }: CustomGolferInput): GolferConfig {
  let profiles = profilesForHandicap(handicapIndex)
  if (knownCarries && Object.keys(knownCarries).length > 0) {
    profiles = scaleProfilesToCarries(profiles, knownCarries)
  }
  return {
    clubProfiles: profiles,
    biasSdDeg: biasSdForHandicap(handicapIndex),
    biasMeanDeg: biasMeanForHandicap(handicapIndex),
    mishitRate: mishitRateForHandicap(handicapIndex),
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
