import { describe, expect, it, vi } from "vitest"
import { fromLocal } from "./geo"
import { createRankHandler, type LieInputs, type RankMessage } from "./rankRequest"
import { sampleBag } from "./regressionHarness"
import * as lookahead from "./lookahead"

vi.mock("./lookahead", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lookahead")>()
  return { ...real, buildLookahead: vi.fn(real.buildLookahead) }
})

const ORIGIN = { lat: 40.3, lng: -74.18 }
const at = (x: number, y: number) => fromLocal(ORIGIN, { x, y })
const box = (x0: number, y0: number, x1: number, y1: number) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]

describe("the look-ahead grid cache", () => {
  const inputs: LieInputs = {
    origin: ORIGIN,
    features: [
      { kind: "fairway", ring: box(-20, 0, 20, 560) },
      { kind: "green", ring: box(-15, 540, 15, 575) },
    ],
    coast: [],
    zones: [],
    extras: {},
  }
  const rank = (y: number, id: number): RankMessage => ({
    type: "rank",
    id,
    liesVersion: 1,
    bagVersion: 1,
    from: at(0, y),
    aim: at(0, 557),
    pin: at(0, 557),
    startLie: "fairway",
    line: [at(0, 0), at(0, 557)],
    handicap: 3,
    spread: 1,
  })

  it("is built once for a ball moved inside one cell, again for another cell, and never when the pin is in reach", () => {
    const build = vi.mocked(lookahead.buildLookahead)
    const handle = createRankHandler()
    handle({ type: "lies", version: 1, inputs })
    handle({ type: "bag", version: 1, clubs: sampleBag(200, 3) })
    handle(rank(277, 1))
    handle(rank(279, 2))
    expect(build).toHaveBeenCalledTimes(1)
    handle(rank(250, 3))
    expect(build).toHaveBeenCalledTimes(2)
    handle(rank(450, 4))
    expect(build).toHaveBeenCalledTimes(2)
  })
})
