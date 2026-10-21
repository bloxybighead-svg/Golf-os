import { describe, it, expect } from "vitest"
import { distanceYds, landingPoint } from "@/lib/course/geo"
import { addChips, finishHole, placeShortOfPin, questionFor, shotsToSave, trackedHoleCounts, unaccountedOn, type HoleCounts } from "./holeTracking"
import { CHIP, PUTTER, recordShot, type ShotTap, type SwingShot } from "./shots"

const tee = { lat: 40, lng: -74 }
const at = (yd: number) => landingPoint(tee, 0, yd, 0)
const pin = at(400)

const tap = (over: Partial<ShotTap> = {}): ShotTap => ({ holeNumber: 1, club: "Driver", clubConfirmed: false, at: tee, atLie: "tee", pin, ...over })
const hole = (over: Partial<HoleCounts> = {}): HoleCounts => ({ strokes: 4, putts: 2, penalty: false, penaltyShot: null, ...over })

/** Driver off the tee, then an approach from the fairway: two swings, the ball still at the approach's start. */
const twoSwings = (): SwingShot[] => recordShot(recordShot([], tap()), tap({ club: "7-Iron", at: at(250), atLie: "fairway" }))

describe("unaccounted", () => {
  it("is the score less swings, putts and penalty strokes", () => {
    expect(unaccountedOn(twoSwings(), 1, hole())).toBe(0)
    expect(unaccountedOn(twoSwings(), 1, hole({ strokes: 5 }))).toBe(1)
    expect(unaccountedOn(twoSwings(), 1, hole({ strokes: 3 }))).toBe(-1)
    expect(unaccountedOn(twoSwings(), 1, hole({ strokes: 5, penalty: true }))).toBe(0)
    expect(unaccountedOn(twoSwings(), 1, hole({ putts: null }))).toBeNull()
  })
})

describe("finishing a hole", () => {
  it("par 4 with 2 swings and 2 putts: the approach finished on the green, no question", () => {
    const f = finishHole(twoSwings(), 1, hole(), null, { at: at(300), lie: "rough" })
    expect(f.tracking).toBe("complete")
    expect(f.unaccounted).toBe(0)
    expect(f.shots[1].toLie).toBe("green") // whatever the marker said
    expect(questionFor(f.unaccounted, 2)).toEqual({ kind: "none" })
  })

  it("places the finish the first putt's distance short of the pin, along its line", () => {
    const f = finishHole(twoSwings(), 1, hole(), 15, { at: at(300), lie: "rough" })
    expect(distanceYds(f.shots[1].to!, pin) * 3).toBeCloseTo(15, 0)
    expect(distanceYds(f.shots[1].from, f.shots[1].to!)).toBeLessThan(distanceYds(f.shots[1].from, pin))
  })

  it("without an answer, uses the ball when it is on the green, else leaves the finish unknown", () => {
    const onGreen = finishHole(twoSwings(), 1, hole(), null, { at: at(392), lie: "green" })
    expect(onGreen.shots[1].to).toEqual(at(392))
    const off = finishHole(twoSwings(), 1, hole(), null, { at: at(300), lie: "rough" })
    expect(off.shots[1].to).toBeNull()
    expect(off.shots[1].toLie).toBe("green")
  })

  it("0 putts means the last swing was holed", () => {
    const f = finishHole(twoSwings(), 1, hole({ strokes: 2, putts: 0 }), null, null)
    expect(f.tracking).toBe("complete")
    expect(f.shots[1]).toMatchObject({ toLie: "holed", to: pin })
  })

  it("score 5 with 2 swings and 2 putts asks exactly one question and is partial until answered", () => {
    const f = finishHole(twoSwings(), 1, hole({ strokes: 5 }), null, { at: at(380), lie: "rough" })
    expect(f.tracking).toBe("partial")
    expect(questionFor(f.unaccounted, 2)).toEqual({ kind: "missing", count: 1 })
    // The last swing is finished where the ball is, so a chip can start there.
    expect(f.shots[1]).toMatchObject({ to: at(380), toLie: "rough" })
  })

  it("answering Chip records an around-the-green shot of unknown club from the last finish and reconciles the hole", () => {
    const ball = { at: at(380), lie: "rough" as const }
    const chipped = addChips(twoSwings(), 1, 1, ball)
    expect(chipped).toHaveLength(3)
    expect(chipped[2]).toMatchObject({ club: CHIP, clubConfirmed: false, from: at(380), shotNumber: 3 })
    const f = finishHole(chipped, 1, hole({ strokes: 5 }), 6, ball)
    expect(f.tracking).toBe("complete")
    expect(f.shots[2]).toMatchObject({ toLie: "green" })
    expect(distanceYds(f.shots[2].to!, pin) * 3).toBeCloseTo(6, 0)
  })

  it("two shots before putting ask one question for two", () => {
    expect(questionFor(2, 2)).toEqual({ kind: "missing", count: 2 })
    expect(addChips(twoSwings(), 1, 2, { at: at(380), lie: "rough" })).toHaveLength(4)
  })

  it("more shots than the score asks to delete one; none recorded asks nothing", () => {
    const f = finishHole(twoSwings(), 1, hole({ strokes: 3 }), null, null)
    expect(f.tracking).toBe("partial")
    expect(questionFor(f.unaccounted, 2)).toEqual({ kind: "excess" })
    expect(finishHole([], 1, hole(), null, null)).toMatchObject({ tracking: "none", unaccounted: null })
    expect(questionFor(3, 0)).toEqual({ kind: "none" })
  })

  it("a ticked penalty lands on the tee shot or the last one and counts as a stroke", () => {
    const tee1 = finishHole(twoSwings(), 1, hole({ strokes: 5, penalty: true, penaltyShot: "tee" }), null, null)
    expect(tee1.shots[0].penaltyStrokes).toBe(1)
    expect(tee1.tracking).toBe("complete")
    const other = finishHole(twoSwings(), 1, hole({ strokes: 5, penalty: true, penaltyShot: "approach" }), null, null)
    expect(other.shots[1].penaltyStrokes).toBe(1)
  })

  it("never blocks: no putts entry leaves the hole partial", () => {
    expect(finishHole(twoSwings(), 1, hole({ putts: null }), null, null).tracking).toBe("partial")
  })

  it("puts the first putt short of the pin on the line", () => {
    const p = placeShortOfPin(tee, pin, 30)
    expect(distanceYds(p, pin)).toBeCloseTo(10, 1)
    expect(distanceYds(tee, p)).toBeCloseTo(distanceYds(tee, pin) - 10, 1)
  })
})

describe("shotsToSave", () => {
  it("adds the putts after a swing that finished on the green; the last putt ends holed", () => {
    const f = finishHole(twoSwings(), 1, hole(), 15, null)
    const rows = shotsToSave(f.shots, [{ holeNumber: 1, putts: 2 }])
    expect(rows.map((r) => r.club)).toEqual(["Driver", "7-Iron", PUTTER, PUTTER])
    expect(rows[2]).toMatchObject({ shotNumber: 3, fromLie: "green", toLie: "green", to: null })
    expect(rows[2].from).toEqual(f.shots[1].to)
    expect(rows[3]).toMatchObject({ toLie: "holed", to: pin })
    expect(rows.every((r) => !("pin" in r))).toBe(true)
  })

  it("a non-green finish never produces a putt", () => {
    // A 21-yard chip that ended in the rough, with putts entered: no putt is placed from it.
    const chip = recordShot([], tap({ club: CHIP, at: at(379), atLie: "rough" }))
    const finished = finishHole(chip, 1, hole({ strokes: 4, putts: 2 }), null, { at: at(379), lie: "rough" })
    expect(finished.tracking).toBe("partial")
    const rows = shotsToSave(finished.shots, [{ holeNumber: 1, putts: 2 }])
    expect(rows.map((r) => r.club)).toEqual([CHIP])
    expect(rows[0].toLie).toBe("rough")
  })

  it("0 putts saves only the swings", () => {
    const f = finishHole(twoSwings(), 1, hole({ strokes: 2, putts: 0 }), null, null)
    expect(shotsToSave(f.shots, [{ holeNumber: 1, putts: 0 }]).map((r) => r.club)).toEqual(["Driver", "7-Iron"])
  })
})

describe("trackedHoleCounts", () => {
  it("counts complete and any tracked holes", () => {
    expect(trackedHoleCounts([{ tracking: "complete" }, { tracking: "partial" }, { tracking: "none" }, {}])).toEqual({ complete: 1, any: 2 })
  })
})
