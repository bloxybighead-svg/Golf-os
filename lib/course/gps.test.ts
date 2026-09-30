import { describe, it, expect } from "vitest"
import { fromLocal } from "./geo"
import { EMPTY_TRACK, judgeFix, type GpsFix, type GpsTrack } from "./gps"

const origin = { lat: 36.5685, lng: -121.949 }
/** A fix `yds` north of the origin, at `sec` seconds, with the given accuracy. */
function fix(yds: number, sec: number, accuracyYds = 5): GpsFix {
  return { ...fromLocal(origin, { x: 0, y: yds }), accuracyYds, t: sec * 1000 }
}

/** Feeds readings in order; returns each verdict. */
function run(...fixes: GpsFix[]): string[] {
  let track: GpsTrack = EMPTY_TRACK
  return fixes.map((f) => {
    const r = judgeFix(track, f)
    track = r.track
    return r.verdict
  })
}

describe("judgeFix", () => {
  it("takes the first good reading", () => {
    expect(run(fix(0, 0))).toEqual(["accept"])
  })

  it("ignores a reading worse than 20 yards, even the first", () => {
    expect(run(fix(0, 0, 35))).toEqual(["inaccurate"])
    expect(run(fix(0, 0), fix(3, 3, 25))).toEqual(["accept", "inaccurate"])
    expect(run(fix(0, 0, NaN))).toEqual(["inaccurate"])
  })

  it("follows walking and riding in a cart", () => {
    expect(run(fix(0, 0), fix(4, 2.5))).toEqual(["accept", "accept"]) // walking, 1.6 yd/s
    expect(run(fix(0, 0), fix(18, 2.5))).toEqual(["accept", "accept"]) // cart, 7 yd/s
  })

  it("rejects a jump no one could make in the time", () => {
    // 150 yd in 2.5 s: 60 yd/s
    expect(run(fix(0, 0), fix(150, 2.5))).toEqual(["accept", "jump"])
  })

  it("believes a big move only once it has held for 3 s", () => {
    expect(run(fix(0, 0), fix(150, 2.5), fix(151, 3.5), fix(150, 4.5), fix(152, 5.5))).toEqual([
      "accept", "jump", "jump", "jump", "accept",
    ])
  })

  it("never believes glitches that don't agree with each other", () => {
    expect(run(fix(0, 0), fix(150, 2.5), fix(-200, 4), fix(150, 6), fix(-200, 8))).toEqual([
      "accept", "jump", "jump", "jump", "jump",
    ])
  })

  it("allows a long move after a long gap", () => {
    // phone asleep for 2 minutes, 300 yd further on
    expect(run(fix(0, 0), fix(300, 120))).toEqual(["accept", "accept"])
  })
})
