import { describe, it, expect } from "vitest"
import { distanceYds, landingPoint } from "@/lib/course/geo"
import {
  addShotAtMidpoint,
  deleteShot,
  describeShot,
  editShot,
  fromDbRow,
  isTooLong,
  lastShotOn,
  midpoint,
  moveSplit,
  recordShot,
  toDbRow,
  TOO_LONG_SHARE,
  UNKNOWN_CLUB,
  type RoundShotRow,
  type ShotTap,
  type SwingShot,
} from "./shots"

const tee = { lat: 40, lng: -74 }
const at = (yd: number) => landingPoint(tee, 0, yd, 0)
const pin = at(400)

function tap(over: Partial<ShotTap> = {}): ShotTap {
  return { holeNumber: 4, club: "Driver", clubConfirmed: false, at: tee, atLie: "tee", pin, ...over }
}

describe("recordShot", () => {
  it("one tap makes exactly one shot, starting at the ball, finishing nowhere yet", () => {
    const shots = recordShot([], tap())
    expect(shots).toHaveLength(1)
    expect(shots[0]).toMatchObject({ holeNumber: 4, shotNumber: 1, club: "Driver", from: tee, fromLie: "tee", to: null, clubConfirmed: false })
  })

  it("the next tap finishes the shot before it where the ball is, and numbers within the hole", () => {
    const first = recordShot([], tap())
    const both = recordShot(first, tap({ club: "7-Iron", clubConfirmed: true, at: at(250), atLie: "fairway" }))
    expect(both).toHaveLength(2)
    expect(both[0]).toMatchObject({ to: at(250), toLie: "fairway" })
    expect(both[1]).toMatchObject({ shotNumber: 2, club: "7-Iron", clubConfirmed: true, from: at(250), to: null })
    // Another hole starts again at 1.
    expect(recordShot(both, tap({ holeNumber: 5 })).at(-1)?.shotNumber).toBe(1)
  })

  it("starts the next shot in the lie the golfer corrected the last finish to", () => {
    const first = recordShot([], tap())
    const edited = editShot(first, 4, 1, { toLie: "rough" })
    const second = recordShot(edited, tap({ at: at(250), atLie: "fairway" }))
    expect(second[0]).toMatchObject({ toLie: "rough" })
    expect(second[1].fromLie).toBe("rough")
  })

  it("never starts a shot in water or out of bounds", () => {
    const first = recordShot([], tap())
    const wet = editShot(first, 4, 1, { toLie: "water" })
    expect(recordShot(wet, tap({ at: at(180), atLie: "rough" }))[1].fromLie).toBe("rough")
  })
})

describe("editShot and deleteShot", () => {
  const two = () => recordShot(recordShot([], tap()), tap({ club: "7-Iron", at: at(250), atLie: "fairway" }))

  it("changing the club makes it the golfer's own pick; the lie and penalty are bounded", () => {
    const e = editShot(two(), 4, 1, { club: "3-Wood", penaltyStrokes: 9 })
    expect(e[0]).toMatchObject({ club: "3-Wood", clubConfirmed: true, penaltyStrokes: 2 })
    expect(e[1].clubConfirmed).toBe(false)
  })

  it("deleting a shot lets the one before finish where it did, and renumbers", () => {
    const three = recordShot(two(), tap({ club: "PW", at: at(380), atLie: "green" }))
    const d = deleteShot(three, 4, 2)
    expect(d).toHaveLength(2)
    expect(d[0]).toMatchObject({ shotNumber: 1, to: at(380), toLie: "green" })
    expect(d[1]).toMatchObject({ shotNumber: 2, club: "PW" })
  })

  it("lastShotOn finds the last of the hole", () => {
    expect(lastShotOn(two(), 4)?.club).toBe("7-Iron")
    expect(lastShotOn(two(), 9)).toBeNull()
  })
})

describe("too long", () => {
  const totals = new Map([["7-Iron", 150]])
  const seven = (yds: number): Pick<SwingShot, "club" | "from" | "to"> => ({ club: "7-Iron", from: tee, to: at(yds) })

  it("flags a shot past 1.15x the club's total, finished or not", () => {
    expect(isTooLong(seven(150 * TOO_LONG_SHARE - 1), null, totals)).toBe(false)
    expect(isTooLong(seven(150 * TOO_LONG_SHARE + 2), null, totals)).toBe(true)
    expect(isTooLong({ club: "7-Iron", from: tee, to: null }, at(200), totals)).toBe(true)
  })

  it("never flags a club the bag does not know, or a shot with no end yet", () => {
    expect(isTooLong({ club: "Chip", from: tee, to: at(400) }, null, totals)).toBe(false)
    expect(isTooLong({ club: "7-Iron", from: tee, to: null }, null, totals)).toBe(false)
  })
})

describe("addShotAtMidpoint", () => {
  it("splits a long shot at the middle of its line into two, the new one with no known club", () => {
    const long = recordShot(recordShot([], tap({ club: "7-Iron" })), tap({ club: "PW", at: at(300), atLie: "green" }))
    const added = addShotAtMidpoint(long, 4, 1, tee, () => "fairway")
    expect(added).toHaveLength(3)
    expect(distanceYds(added[0].to!, at(150))).toBeLessThan(1)
    expect(added[0]).toMatchObject({ toLie: "fairway", club: "7-Iron" })
    expect(added[1]).toMatchObject({ shotNumber: 2, club: UNKNOWN_CLUB, clubConfirmed: false, fromLie: "fairway", toLie: "green" })
    expect(added[1].to).toEqual(at(300))
    expect(added[2]).toMatchObject({ shotNumber: 3, club: "PW" })
  })

  it("splits the last, unfinished shot using the ball as its end", () => {
    const one = recordShot([], tap({ club: "7-Iron" }))
    const added = addShotAtMidpoint(one, 4, 1, at(200), () => "rough")
    expect(added).toHaveLength(2)
    expect(distanceYds(added[0].to!, at(100))).toBeLessThan(1)
    expect(added[1].to).toBeNull()
  })

  it("dragging the midpoint moves where the first finishes and the next starts", () => {
    const one = addShotAtMidpoint(recordShot([], tap()), 4, 1, at(200), () => "rough")
    const moved = moveSplit(one, 4, 1, at(120), "bunker")
    expect(moved[0]).toMatchObject({ to: at(120), toLie: "bunker" })
    expect(moved[1]).toMatchObject({ from: at(120), fromLie: "bunker" })
  })

  it("midpoint is halfway", () => {
    expect(distanceYds(midpoint(tee, at(100)), at(50))).toBeLessThan(0.5)
  })
})

describe("describeShot and rows", () => {
  it("reads club, lie and distance", () => {
    expect(describeShot({ club: "7-Iron", from: tee, to: at(162), toLie: "fairway" })).toBe("7-Iron, fairway, 162 yd")
    expect(describeShot({ club: "Chip", from: tee, to: null, toLie: "green" })).toBe("Chip, green")
  })

  it("round-trips a row, club_confirmed included; an old row without it reads as unconfirmed", () => {
    const shot = recordShot([], tap({ clubConfirmed: true }))[0]
    const row = toDbRow("r", "u", shot)
    expect(row.club_confirmed).toBe(true)
    expect(fromDbRow(row as unknown as RoundShotRow)).toMatchObject({ club: "Driver", clubConfirmed: true, from: tee, to: null })
    const old = { ...row, club_confirmed: undefined } as unknown as RoundShotRow
    expect(fromDbRow(old).clubConfirmed).toBe(false)
  })
})
