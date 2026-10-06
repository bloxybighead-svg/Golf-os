import { describe, expect, it } from "vitest"
import { fromLocal } from "./geo"
import { buildLieMap } from "./lies"
import { getBaseline } from "./baseline"
import { evaluateClub, isLowConfidence, UNMAPPED_LOW_CONFIDENCE, type ShotSample } from "./plan"

const ORIGIN = { lat: 36.5685, lng: -121.949 }
const at = (x: number, y: number) => fromLocal(ORIGIN, { x, y })
const rect = (x0: number, y0: number, x1: number, y1: number) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]
const fairway = { kind: "fairway" as const, ring: rect(-20, 100, 20, 300) }
const pin = at(0, 400)
const baseline = getBaseline(10)

/** 100 shots; the first `offline` finish 60 yd wide, off the mapped fairway. */
const pattern = (offline: number): ShotSample[] =>
  Array.from({ length: 100 }, (_, i) => ({ carryYds: 180 + (i % 10), offlineYds: i < offline ? 60 : (i % 7) - 3 }))

describe("unmapped ground: advisory only", () => {
  it("scores exactly as mapped rough (no extra cost for being unmapped)", () => {
    const unmapped = buildLieMap(ORIGIN, [fairway])
    const mappedRough = buildLieMap(ORIGIN, [fairway], [], [{ id: "r", lie: "rough", ring: rect(30, 0, 120, 600) }])
    const run = (lies: typeof unmapped) => evaluateClub({ club: "7-Iron", shots: pattern(80) }, { from: ORIGIN, aim: pin, pin, lies, baseline })
    const a = run(unmapped)
    const b = run(mappedRough)
    expect(a.unmappedShare).toBe(0.8)
    expect(b.unmappedShare).toBe(0)
    expect(a.expectedStrokes).toBeCloseTo(b.expectedStrokes, 10)
  })

  it("the flag flips above 25%, not at it", () => {
    expect(UNMAPPED_LOW_CONFIDENCE).toBe(0.25)
    expect(isLowConfidence({ unmappedShare: 0.25 })).toBe(false)
    expect(isLowConfidence({ unmappedShare: 0.26 })).toBe(true)
    const lies = buildLieMap(ORIGIN, [fairway])
    const run = (offline: number) => evaluateClub({ club: "7-Iron", shots: pattern(offline) }, { from: ORIGIN, aim: pin, pin, lies, baseline })
    expect(isLowConfidence(run(24))).toBe(false)
    expect(isLowConfidence(run(26))).toBe(true)
  })
})
