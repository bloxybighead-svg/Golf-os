import { describe, expect, it } from "vitest"
import { holesFor, playOrder, type ActiveRound } from "./activeRound"
import { nextHoleTarget, trackDwell, withinOfferRadius } from "./holeOffer"

const tee = { lat: 40, lng: -74 }
const yardsNorth = (yds: number) => ({ lat: tee.lat + yds / 121_700, lng: tee.lng }) // one degree of latitude is about 121,700 yd

describe("trackDwell", () => {
  it("starts when the golfer comes within the radius and keeps the start while they stay", () => {
    const first = trackDwell(null, true, 1000)
    expect(first).toBe(1000)
    expect(trackDwell(first, true, 9000)).toBe(1000)
  })
  it("starts over once they leave", () => {
    expect(trackDwell(1000, false, 5000)).toBeNull()
    expect(trackDwell(trackDwell(1000, false, 5000), true, 6000)).toBe(6000)
  })
})

describe("withinOfferRadius", () => {
  it("is 30 yd, inclusive of 29 and not 31", () => {
    expect(withinOfferRadius(yardsNorth(29), tee)).toBe(true)
    expect(withinOfferRadius(yardsNorth(31), tee)).toBe(false)
  })
})

describe("nextHoleTarget", () => {
  const holes = [7, 8, 9].map((ref) => ({ ref, line: [{ lat: 40 + ref / 1000, lng: -74 }] }))
  const round = (strokes: (number | null)[]): ActiveRound =>
    ({ holes: holesFor(playOrder(7, 3)).map((h, i) => ({ ...h, strokes: strokes[i] })) }) as ActiveRound

  it("is the next hole's tee once the current hole is scored", () => {
    expect(nextHoleTarget(round([4, null, null]), 7, holes)).toEqual({ holeNumber: 8, tee: holes[1].line[0] })
  })
  it("is null while the current hole has no score", () => {
    expect(nextHoleTarget(round([null, null, null]), 7, holes)).toBeNull()
  })
  it("is null on the last hole, with no round, or when the map has no line for the next hole", () => {
    expect(nextHoleTarget(round([4, 4, 4]), 9, holes)).toBeNull()
    expect(nextHoleTarget(null, 7, holes)).toBeNull()
    expect(nextHoleTarget(round([4, null, null]), 7, [holes[0], holes[2]])).toBeNull()
  })
})
