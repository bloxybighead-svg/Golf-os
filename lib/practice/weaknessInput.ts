// Rounds as the weakness scores read them: the strokes gained worked out in the browser, with the holes beside it.

import type { RoundSgResult } from "@/lib/rounds/roundSg"
import type { SgRoundData } from "@/lib/supabase/loadSgData"
import type { WeaknessRound } from "./weakness"

/** `results` are `data` run through roundSg, in the same order (newest first). */
export function toWeaknessRounds(data: readonly SgRoundData[], results: readonly RoundSgResult[]): WeaknessRound[] {
  return data.flatMap((d, i) =>
    results[i]
      ? [
          {
            sg: results[i],
            holes: d.holes,
            tiger5: { holes: d.holes, shots: d.shots, three_putts: d.round.three_putts ?? null },
            // Strokes per 18 holes, so a nine and a full round are comparable.
            score: d.holes.length > 0 ? (d.holes.reduce((n, h) => n + h.strokes, 0) * 18) / d.holes.length : null,
          },
        ]
      : []
  )
}
