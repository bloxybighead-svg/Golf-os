// The small rules behind the Play result card's lines.

import type { Options } from "@/lib/course/strategy"

/** The risk line stays hidden at or under this share of shots. ESTIMATE: one shot in a hundred is noise. */
export const RISK_SHOWN_ABOVE = 0.01

/** The risk line turns to a warning colour above this share. ESTIMATE: about one shot in twenty. */
export const RISK_WARN_ABOVE = 0.05

/** "plays N" shows only when it differs from the raw distance by at least this, yards. */
export const PLAYS_SHOWN_FROM_YDS = 2

/** Carry and finish are both shown only when they differ by at least this, yards. */
export const CARRY_FINISH_DIFFER_YDS = 5

interface Shares {
  lieShare: { oob: number; water: number; trees?: number }
}

/** The one biggest risk ("3% OB", "8% water", "12% trees"); null when it is 1% or less. OB and water are the penalty strokes, trees only cost position. */
export function riskLine(plan: Shares): { text: string; warn: boolean } | null {
  const options = [
    { word: "OB", share: plan.lieShare.oob },
    { word: "water", share: plan.lieShare.water },
    { word: "trees", share: plan.lieShare.trees ?? 0 },
  ]
  const top = options.reduce((a, b) => (b.share > a.share ? b : a))
  if (top.share <= RISK_SHOWN_ABOVE) return null
  return { text: `${Math.round(top.share * 100)}% ${top.word}`, warn: top.share > RISK_WARN_ABOVE }
}

/** What the distance plays like, when that differs from the raw number enough to matter; else null. */
export function playsShown(rawYds: number, playsYds: number | null | undefined): number | null {
  return playsYds != null && Math.abs(playsYds - rawYds) >= PLAYS_SHOWN_FROM_YDS ? Math.round(playsYds) : null
}

type Choice = { club: string; strategy?: "smart" | "go" }

/** "Smart play" or "Go for it" when the two options differ and the chosen club is one of them; else null. */
export function strategyLabel<T extends Choice>(options: Options<T> | null, chosen: T): string | null {
  if (!options || options.same) return null
  const strategy = chosen.strategy ?? "smart"
  const mine = strategy === "go" ? options.lowest : options.safer
  return mine.club === chosen.club ? (strategy === "go" ? "Go for it" : "Smart play") : null
}

/** The option the chosen club is measured against: the best club when another was picked, else the other of Smart play / Go for it. */
export function otherOption<T extends Choice>(options: Options<T> | null, chosen: T, best: T): T | null {
  if (chosen.club !== best.club) return best
  if (!options || options.same) return null
  return (chosen.strategy ?? "smart") === "go" ? options.safer : options.lowest
}
