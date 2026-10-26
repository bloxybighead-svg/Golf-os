import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { StatsEmpty } from "@/components/you/StatsEmpty"
import { Tiger5Section } from "@/components/you/Tiger5Section"
import { SgView } from "@/components/you/SgSection"
import { summarizeRounds } from "@/lib/rounds/roundSg"
import type { SgRoundData } from "@/lib/supabase/loadSgData"

const oneRound: SgRoundData = {
  meta: { date: "2026-10-10", courseName: "Colts Neck" },
  round: { id: "r0", holes_played: 1, fairways_pct: null, gir_pct: null, total_putts: null, up_and_downs: null, three_putts: null },
  holes: [{ hole_number: 1, par: 4, strokes: 7, putts: 3, fairway_hit: true, green_hit: false, penalty: false, penalty_shot: null, tracking: "none" }],
  shots: [],
  yards: { holes: {}, course: null },
}

describe("stats empty states", () => {
  it("with no rounds shows one card with exactly one Add round button", () => {
    for (const signedIn of [true, false]) {
      const html = renderToStaticMarkup(<StatsEmpty signedIn={signedIn} />)
      expect(html).toContain("Your stats start with one round")
      expect(html).toContain("After 1 round: strokes gained and Tiger 5")
      expect(html).toContain("After 3 rounds: handicap estimate")
      expect(html.match(/Add round/g)).toHaveLength(1)
      expect(html.match(/<a /g)).toHaveLength(1)
    }
    expect(renderToStaticMarkup(<StatsEmpty signedIn={false} />)).toContain("/login?redirect=%2Fyou%2Fstats")
  })

  it("with one round the strokes gained and Tiger 5 cards render, with no empty-state card or link", () => {
    const tiger = renderToStaticMarkup(<Tiger5Section data={[oneRound]} />)
    expect(tiger).toContain("per 18")
    const sg = renderToStaticMarkup(<SgView ready label="scratch" summary={summarizeRounds([])} meta={new Map()} />)
    expect(sg).toContain("Strokes gained")
    for (const html of [tiger, sg]) {
      expect(html).not.toContain("start with one round")
      expect(html).not.toContain("<a ")
    }
  })
})
