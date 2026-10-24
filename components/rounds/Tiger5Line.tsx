import { TIGER5_ITEMS, TIGER5_LABEL, tiger5 } from "@/lib/rounds/tiger5"
import type { SgRoundData } from "@/lib/supabase/loadSgData"

/** "Tiger 5: 3" with the mistakes that happened as short chips. Unknown items are left out, and "partial" says some are. */
export function Tiger5Line({ data }: { data: SgRoundData }) {
  const result = tiger5({ holes: data.holes, shots: data.shots, three_putts: data.round.three_putts ?? null })
  if (result.known === 0) return null
  const chips = TIGER5_ITEMS.flatMap((item) => {
    const n = result.items[item]
    return n ? [`${n} ${TIGER5_LABEL[item][n === 1 ? "one" : "many"]}`] : []
  })
  return (
    <p className="mt-2 text-xs text-muted">
      <span className={["font-semibold", result.total === 0 ? "text-accent" : "text-fg"].join(" ")}>Tiger 5: {result.total}</span>
      {chips.length > 0 && ` · ${chips.join(" · ")}`}
      {result.known < TIGER5_ITEMS.length && " · partial"}
    </p>
  )
}
