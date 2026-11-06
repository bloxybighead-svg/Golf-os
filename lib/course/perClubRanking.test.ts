import { describe, expect, it } from "vitest"
import { DEFAULT_BAG } from "@/lib/golfer/bag"
import { pebbleH1 } from "./regressionHarness"
import { penaltyShare } from "./strategy"

const byClub = (r: ReturnType<typeof pebbleH1>) =>
  Object.fromEntries(r.ranking.map((x) => [x.club, { strokes: x.plan.expectedStrokes, pen: penaltyShare(x.plan), aim: x.offsetYds, smartAim: x.safe?.offsetYds, smartPen: x.safe ? penaltyShare(x.safe.plan) : null }]))

// With the look-ahead ON, a tee shot is valued by the best NEXT shot from the bag, so adding a club can legitimately
// change another club's strokes and aim (a better second shot exists). That is bag-dependent by design, not seed noise.
describe("Pebble H1: a club's numbers do not depend on the rest of the bag", () => {
  const small = DEFAULT_BAG.filter((c) => c !== "5-Wood" && c !== "9-Iron")
  for (const hcp of [10, 18]) {
    it(`handicap ${hcp}: adding a club leaves every other club's strokes, penalty and aim identical`, () => {
      const a = byClub(pebbleH1(hcp, { bag: small, lookahead: false }))
      const b = byClub(pebbleH1(hcp, { bag: DEFAULT_BAG, lookahead: false }))
      for (const club of small) expect(b[club], club).toEqual(a[club])
    })
  }
  it("the same inputs give the same output on every run", () => {
    expect(byClub(pebbleH1(10))).toEqual(byClub(pebbleH1(10)))
  })
})
