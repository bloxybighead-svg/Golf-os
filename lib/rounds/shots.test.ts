import { describe, it, expect } from "vitest"
import { distanceYds, landingPoint } from "@/lib/course/geo"
import { NEW_SHOT_YDS } from "@/lib/planner/clubChoice"
import { describeShot, editLastShot, fromDbRow, lastShotOn, PUTTER, shotsToSave, toDbRow, trackBallMove, type BallMove, type RoundShotRow, type SwingShot } from "./shots"

const tee = { lat: 40, lng: -74 }
const pin = landingPoint(tee, 0, 400, 0)
const at = (yd: number) => landingPoint(tee, 0, yd, 0)

function move(over: Partial<BallMove> = {}): BallMove {
  return { holeNumber: 4, choice: "Driver", from: tee, fromLie: "tee", to: at(250), toLie: "fairway", pin, following: false, ...over }
}

function swing(over: Partial<BallMove> = {}, shots: SwingShot[] = []) {
  return trackBallMove(shots, move(over))
}

describe("trackBallMove", () => {
  it("records a shot for a picked club and a real walk", () => {
    expect(trackBallMove([], move({ choice: "7-Iron", to: at(NEW_SHOT_YDS + 5) }))).toHaveLength(1)
    expect(trackBallMove([], move({ choice: "go:Driver" }))[0].club).toBe("Driver")
  })
  it("ignores auto, a nudge, and a move from nowhere", () => {
    expect(trackBallMove([], move({ choice: "auto" }))).toEqual([])
    expect(trackBallMove([], move({ choice: "7-Iron", to: at(NEW_SHOT_YDS - 5) }))).toEqual([])
    expect(trackBallMove([], move({ from: null }))).toEqual([])
  })
  it("keeps the finish with the golfer while they walk to the ball with GPS following", () => {
    const first = trackBallMove([], move({ to: at(40) }))
    const walked = trackBallMove(first, move({ choice: "auto", from: at(40), to: at(240), toLie: "rough", following: true }))
    expect(walked).toHaveLength(1)
    expect(walked[0]).toMatchObject({ to: at(240), toLie: "rough", club: "Driver", from: tee })
  })
  it("does not move a finish for a tap, or once the next club is picked", () => {
    const first = trackBallMove([], move())
    expect(trackBallMove(first, move({ choice: "auto", from: at(250), to: at(260) }))).toEqual(first)
    expect(trackBallMove(first, move({ choice: "7-Iron", from: at(250), to: at(255), following: true }))).toEqual(first)
  })
})

describe("recording a shot", () => {
  it("numbers shots within the hole and strips the go-for-it prefix", () => {
    const a = swing({ choice: "go:Driver" })
    const b = swing({ choice: "7-Iron", from: at(250), fromLie: "fairway", to: at(380), toLie: "green" }, a)
    expect(a[0]).toMatchObject({ shotNumber: 1, club: "Driver", fromLie: "tee" })
    expect(b[1]).toMatchObject({ shotNumber: 2, club: "7-Iron", toLie: "green" })
  })
  it("starts the next shot in the lie the golfer corrected the last one to", () => {
    const first = editLastShot(swing(), 4, { toLie: "rough" })
    const second = swing({ from: at(250), fromLie: "fairway", to: at(380), toLie: "green" }, first)
    expect(second[1].fromLie).toBe("rough")
  })
  it("does not start from water or out of bounds", () => {
    const first = swing({ toLie: "water" })
    const second = swing({ from: at(200), fromLie: "rough", to: at(380), toLie: "green" }, first)
    expect(second[1].fromLie).toBe("rough")
  })
  it("starts shot numbers again on another hole", () => {
    const shots = swing({ holeNumber: 3 })
    expect(swing({ holeNumber: 4 }, shots)[1].shotNumber).toBe(1)
  })
})

describe("editLastShot", () => {
  it("changes only the last shot of that hole", () => {
    const shots = swing({ from: at(250), fromLie: "fairway", to: at(380), toLie: "green" }, swing())
    const edited = editLastShot(shots, 4, { club: "8-Iron", toLie: "bunker", penaltyStrokes: 1 })
    expect(edited[0].club).toBe("Driver")
    expect(edited[1]).toMatchObject({ club: "8-Iron", toLie: "bunker", penaltyStrokes: 1 })
  })
  it("keeps penalty strokes within range and ignores a hole with no shots", () => {
    expect(editLastShot(swing(), 4, { penaltyStrokes: 9 })[0].penaltyStrokes).toBe(2)
    expect(editLastShot(swing(), 7, { club: "PW" })).toEqual(swing())
  })
})

describe("describeShot", () => {
  it("reads like the line on screen", () => {
    expect(describeShot(swing({ choice: "7-Iron", to: at(162), toLie: "fairway" })[0])).toBe("7-Iron, fairway, 162 yd")
  })
  it("leaves the distance off when positions are unknown", () => {
    const [, second] = shotsToSave(swing({ to: at(380), toLie: "green" }), new Map([[4, 2]]))
    expect(describeShot(second)).toBe("Putter, green")
  })
})

describe("shotsToSave", () => {
  const swings = swing({ to: at(380), toLie: "green" })
  it("closes the hole with putts: the first from the approach finish, the last at the pin", () => {
    const rows = shotsToSave(swings, new Map([[4, 3]]))
    expect(rows.map((r) => [r.shotNumber, r.club])).toEqual([[1, "Driver"], [2, PUTTER], [3, PUTTER], [4, PUTTER]])
    expect(rows[1]).toMatchObject({ from: at(380), fromLie: "green", to: null, toLie: "green" })
    expect(rows[2]).toMatchObject({ from: null, to: null })
    expect(rows[3]).toMatchObject({ from: null, to: pin, toLie: "holed" })
  })
  it("a single putt runs from the approach finish to the pin", () => {
    const [, putt] = shotsToSave(swings, new Map([[4, 1]]))
    expect(putt).toMatchObject({ from: at(380), to: pin, toLie: "holed" })
    expect(distanceYds(putt.from!, putt.to!)).toBeCloseTo(20, 0)
  })
  it("keeps only the swings when putts are not known", () => {
    expect(shotsToSave(swings, new Map([[4, null]]))).toHaveLength(1)
    expect(shotsToSave(swings, new Map())).toHaveLength(1)
  })
  it("leaves the device-only pin out of what is saved", () => {
    expect(shotsToSave(swings, new Map())[0]).not.toHaveProperty("pin")
  })
})

describe("toDbRow", () => {
  it("maps a shot to its columns, nulls included", () => {
    const [, putt] = shotsToSave(swing({ to: at(380), toLie: "green" }), new Map([[4, 2]]))
    expect(toDbRow("r1", "u1", putt)).toMatchObject({
      round_id: "r1", user_id: "u1", hole_number: 4, shot_number: 2, club: PUTTER,
      from_lat: at(380).lat, from_lie: "green", to_lat: null, to_lng: null, to_lie: "green", penalty_strokes: 0,
    })
  })
})

describe("fromDbRow", () => {
  it("reads back what toDbRow wrote", () => {
    const rows = shotsToSave(swing({ to: at(380), toLie: "green" }), new Map([[4, 2]]))
    for (const r of rows) expect(fromDbRow(toDbRow("r1", "u1", r) as RoundShotRow)).toEqual(r)
  })
})

describe("lastShotOn", () => {
  it("is the latest swing shot on that hole", () => {
    const shots = swing({ from: at(250), fromLie: "fairway", to: at(380), toLie: "green" }, swing())
    expect(lastShotOn(shots, 4)?.shotNumber).toBe(2)
    expect(lastShotOn(shots, 5)).toBeNull()
  })
})
