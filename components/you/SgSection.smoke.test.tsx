import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { getBaseline } from "@/lib/course/baseline"
import { SgView } from "@/components/you/SgSection"
import { RoundDetailBody } from "@/components/rounds/RoundDetail"
import { roundSg, summarizeRounds, type SgContext, type SgHoleRow } from "@/lib/rounds/roundSg"
import { resolveHoleYards } from "@/lib/rounds/sgEstimate"
import type { SgRoundData } from "@/lib/supabase/loadSgData"
import type { Round } from "@/lib/supabase/types"

const ctx: SgContext = { baseline: getBaseline(0), driverTotalYds: 250, yardsFor: (_n, par) => resolveHoleYards({ par, holeYds: null, courseTotalYds: null }) }
const hole = (n: number, over: Partial<SgHoleRow> = {}): SgHoleRow => ({
  hole_number: n, par: 4, strokes: 5, putts: 2, fairway_hit: true, green_hit: false, penalty: false, penalty_shot: null, tracking: "none", ...over,
})

// Scorecard-only rounds: holes, no shots.
const rounds = (n: number): SgRoundData[] =>
  Array.from({ length: n }, (_, i) => ({
    meta: { date: `2026-10-${10 + i}`, courseName: "Colts Neck" },
    round: { id: `r${i}`, holes_played: 2, fairways_pct: null, gir_pct: null, total_putts: null, up_and_downs: null },
    holes: [hole(1), hole(2, { putts: 3, strokes: 6 })],
    shots: [],
    yards: { holes: {}, course: null },
  }))

const view = (n: number) => {
  const data = rounds(n)
  const results = data.map((d) => roundSg(d.round, d.holes, d.shots, ctx))
  return renderToStaticMarkup(<SgView ready label="scratch" summary={summarizeRounds(results)} meta={new Map(data.map((d) => [d.round.id, d.meta]))} />)
}

describe("the strokes gained section on Stats", () => {
  it("renders the four categories and what it rests on from scorecard rounds alone", () => {
    const html = view(2)
    for (const c of ["Off-Tee", "Approach", "Short Game", "Putting"]) expect(html).toContain(c)
    expect(html).toContain("vs scratch")
    expect(html).toContain("2 rounds: 2 from your scorecard")
    expect(html).toContain("strokes per round")
  })

  it("draws bars only with 5 or more rounds", () => {
    expect(view(4)).not.toContain("rounded-full bg-surface-3")
    expect(view(5)).toContain("rounded-full bg-surface-3")
  })

  it("says what to do with no rounds", () => {
    const html = renderToStaticMarkup(<SgView ready label="scratch" summary={summarizeRounds([])} meta={new Map()} />)
    expect(html).toContain("Log a round")
  })
})

describe("round detail", () => {
  it("lists every hole with its strokes gained and where it came from", () => {
    const [d] = rounds(1)
    const sg = roundSg(d.round, d.holes, d.shots, ctx)
    const round = { id: "r0", course_name: "Colts Neck", score: 11 } as Round
    const html = renderToStaticMarkup(<RoundDetailBody round={round} data={d} sg={sg} label="scratch" />)
    expect(html.match(/Scorecard/g)?.length).toBe(2)
    expect(html).toContain("vs scratch")
    expect(html).toMatch(/[+–]\d\.\d\d/)
  })

  it("a round known only by its total says its strokes gained is an estimate", () => {
    const d: SgRoundData = { ...rounds(1)[0], holes: [] }
    const sg = roundSg(d.round, d.holes, d.shots, ctx)
    const html = renderToStaticMarkup(<RoundDetailBody round={{ id: "r0", course_name: "X", score: 90 } as Round} data={d} sg={sg} label="scratch" />)
    expect(html).toContain("estimate from the round totals")
  })
})
