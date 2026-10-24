import { describe, expect, it } from "vitest"
import { getBaseline } from "@/lib/course/baseline"
import { DEFAULT_HOLE_YARDS, estimateHoleSg, eGreen, missedGreen, resolveHoleYards, type EstimateHole } from "./sgEstimate"

const scratch = getBaseline(0)
const ctx = (par: number, baseline = scratch) => ({
  baseline,
  driverTotalYds: 250,
  yards: resolveHoleYards({ par, holeYds: DEFAULT_HOLE_YARDS[par as 3 | 4 | 5], courseTotalYds: null }),
})

const hole = (over: Partial<EstimateHole> & Pick<EstimateHole, "par" | "strokes">): EstimateHole => ({
  holeNumber: 1,
  putts: 2,
  fairwayHit: null,
  greenHit: null,
  penalty: false,
  penaltyShot: null,
  firstPuttFt: null,
  ...over,
})

const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0)

describe("estimateHoleSg", () => {
  it("phases add up exactly to E(tee) - strokes on every hole shape", () => {
    let checked = 0
    for (const baseline of [getBaseline(0), getBaseline(8), getBaseline(20)]) {
      for (const par of [3, 4, 5]) {
        for (let strokes = 1; strokes <= 10; strokes++) {
          for (const putts of [null, 0, 1, 2, 3, 4]) {
            if (putts != null && putts > strokes) continue
            for (const fairwayHit of [null, true, false]) {
              for (const greenHit of [null, true, false]) {
                for (const penaltyShot of [null, "tee", "approach", "other"] as const) {
                  const h = hole({ par, strokes, putts, fairwayHit: par === 3 ? null : fairwayHit, greenHit, penalty: penaltyShot != null, penaltyShot })
                  const r = estimateHoleSg(h, ctx(par, baseline))
                  const eTee = baseline.expectedFromStart("tee", DEFAULT_HOLE_YARDS[par as 3 | 4 | 5])
                  expect(r.total).toBeCloseTo(eTee - strokes, 9)
                  if (r.categories) expect(sum(r.categories)).toBeCloseTo(r.total, 9)
                  checked++
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it("gives only the total when the hole has no putts entry", () => {
    const r = estimateHoleSg(hole({ par: 4, strokes: 5, putts: null }), ctx(4))
    expect(r.categories).toBeNull()
    expect(r.total).toBeCloseTo(scratch.expectedFromStart("tee", 390) - 5, 9)
  })

  it("a fairway hit versus missed moves strokes between off the tee and approach only", () => {
    const hit = estimateHoleSg(hole({ par: 4, strokes: 5, putts: 2, fairwayHit: true, greenHit: true }), ctx(4))
    const miss = estimateHoleSg(hole({ par: 4, strokes: 5, putts: 2, fairwayHit: false, greenHit: true }), ctx(4))
    expect(miss.total).toBeCloseTo(hit.total, 9)
    expect(miss.categories!.off_tee).toBeLessThan(hit.categories!.off_tee)
    expect(miss.categories!.approach).toBeGreaterThan(hit.categories!.approach)
    expect(miss.categories!.off_tee + miss.categories!.approach).toBeCloseTo(hit.categories!.off_tee + hit.categories!.approach, 9)
    expect(miss.categories!.short_game).toBe(hit.categories!.short_game)
    expect(miss.categories!.putting).toBe(hit.categories!.putting)
  })

  it("a missed green made in par or better with one putt gains strokes around the green", () => {
    const r = estimateHoleSg(hole({ par: 4, strokes: 4, putts: 1, fairwayHit: true, greenHit: false }), ctx(4))
    expect(r.categories!.short_game).toBeGreaterThan(0)
    // Unentered green, same score: more strokes before putting than a regulation hole allows reads as a miss.
    const inferred = estimateHoleSg(hole({ par: 4, strokes: 4, putts: 1, greenHit: null }), ctx(4))
    expect(inferred.categories!.short_game).toBeGreaterThan(0)
  })

  it("a tee penalty costs the off-the-tee phase, not the approach", () => {
    const clean = estimateHoleSg(hole({ par: 4, strokes: 5, putts: 2, fairwayHit: false, greenHit: true }), ctx(4))
    const penal = estimateHoleSg(hole({ par: 4, strokes: 6, putts: 2, fairwayHit: false, greenHit: true, penalty: true, penaltyShot: "tee" }), ctx(4))
    expect(penal.categories!.off_tee).toBeCloseTo(clean.categories!.off_tee - 1, 9)
    expect(penal.categories!.approach).toBeCloseTo(clean.categories!.approach, 9)
  })

  it("an approach penalty lands in the approach phase", () => {
    const clean = estimateHoleSg(hole({ par: 4, strokes: 5, putts: 2, fairwayHit: true, greenHit: true }), ctx(4))
    const penal = estimateHoleSg(hole({ par: 4, strokes: 6, putts: 2, fairwayHit: true, greenHit: true, penalty: true, penaltyShot: "approach" }), ctx(4))
    expect(penal.categories!.approach).toBeCloseTo(clean.categories!.approach - 1, 9)
    expect(penal.categories!.off_tee).toBeCloseTo(clean.categories!.off_tee, 9)
  })

  it("a par 3 tee shot is an approach, from the hole's yards", () => {
    const r = estimateHoleSg(hole({ par: 3, strokes: 3, putts: 2, greenHit: true }), ctx(3))
    expect(r.categories!.off_tee).toBe(0)
    expect(r.approachStartYds).toBe(DEFAULT_HOLE_YARDS[3])
  })

  it("the tee shot finishes at the hole's yards minus the driver total, never inside 40 yd", () => {
    const long = estimateHoleSg(hole({ par: 4, strokes: 4, putts: 2, greenHit: true }), { ...ctx(4), driverTotalYds: 250 })
    expect(long.approachStartYds).toBe(140)
    const tiny = estimateHoleSg(hole({ par: 4, strokes: 4, putts: 2, greenHit: true }), { ...ctx(4), driverTotalYds: 400 })
    expect(tiny.approachStartYds).toBe(40)
  })

  it("the golfer's own first putt beats the estimate and moves strokes between approach and putting", () => {
    const guess = estimateHoleSg(hole({ par: 4, strokes: 4, putts: 2, greenHit: true }), ctx(4))
    const close = estimateHoleSg(hole({ par: 4, strokes: 4, putts: 2, greenHit: true, firstPuttFt: 3 }), ctx(4))
    expect(guess.puttEstimated).toBe(true)
    expect(close.puttEstimated).toBe(false)
    expect(close.total).toBeCloseTo(guess.total, 9)
    expect(close.categories!.putting).toBeCloseTo(eGreen(scratch, 3) - 2, 9)
    expect(close.categories!.putting).toBeLessThan(guess.categories!.putting)
  })

  it("holing out has no putting phase", () => {
    const r = estimateHoleSg(hole({ par: 3, strokes: 1, putts: 0, greenHit: true }), ctx(3))
    expect(r.categories!.putting).toBe(0)
    expect(r.total).toBeCloseTo(scratch.expectedFromStart("tee", 165) - 1, 9)
  })

  it("extra strokes before putting beyond tee, approach and one chip are extra approach shots", () => {
    const three = estimateHoleSg(hole({ par: 4, strokes: 6, putts: 2, greenHit: false }), ctx(4))
    expect(three.categories!.short_game).not.toBe(0)
    expect(sum(three.categories!)).toBeCloseTo(three.total, 9)
  })
})

describe("missedGreen", () => {
  it("trusts the green entry, else counts strokes before putting against a regulation hole", () => {
    expect(missedGreen({ par: 4, strokes: 4, putts: 2, greenHit: false })).toBe(true)
    expect(missedGreen({ par: 4, strokes: 5, putts: 1, greenHit: true })).toBe(false)
    expect(missedGreen({ par: 4, strokes: 4, putts: 2, greenHit: null })).toBe(false)
    expect(missedGreen({ par: 4, strokes: 4, putts: 1, greenHit: null })).toBe(true)
    expect(missedGreen({ par: 3, strokes: 3, putts: 1, greenHit: null })).toBe(true)
    expect(missedGreen({ par: 4, strokes: 4, putts: null, greenHit: null })).toBe(false)
  })
})

describe("resolveHoleYards", () => {
  it("prefers the scorecard, then the course total by par share, then a typical hole, and says which", () => {
    expect(resolveHoleYards({ par: 4, holeYds: 412, courseTotalYds: 6500 })).toEqual({ yds: 412, source: "scorecard" })
    const share = resolveHoleYards({ par: 4, holeYds: null, courseTotalYds: 6500 })
    expect(share.source).toBe("course_total")
    expect(share.yds).toBe(380) // 6500 x 380 / 6500: the reference round's par 4
    expect(resolveHoleYards({ par: 5, holeYds: null, courseTotalYds: 5200 }).yds).toBe(408) // a shorter course, a shorter par 5
    expect(resolveHoleYards({ par: 3, holeYds: null, courseTotalYds: null })).toEqual({ yds: 165, source: "par_default" })
    expect(resolveHoleYards({ par: 5, holeYds: null, courseTotalYds: null }).yds).toBe(520)
  })
})
