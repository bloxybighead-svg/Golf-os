import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import path from "path"
import type { ClubPlan, OptimizedClubPlan } from "@/lib/course/plan"
import { choiceAfterBallMove, choiceAfterHolePick, choiceInBag, chosenPlan, NEW_SHOT_YDS } from "./clubChoice"
import { landingPoint } from "@/lib/course/geo"

const plan = (club: string, strokes: number): OptimizedClubPlan => ({
  club,
  bearingDeg: 0,
  offsetYds: 0,
  atAimStrokes: strokes,
  plan: { club, expectedStrokes: strokes, strokesSe: 0.02 } as unknown as ClubPlan,
})
const ranked = [plan("4-Iron", 4.6), plan("3-Wood", 4.68), plan("Driver", 4.7)]

describe("a picked club holds", () => {
  it("through a ball move: moving the ball (GPS follow or a tap) no longer touches the choice", () => {
    const src = readFileSync(path.resolve(__dirname, "../../hooks/useBallPosition.ts"), "utf8")
    const moveBallTo = src.slice(src.indexOf("function moveBallTo"), src.indexOf("function toggleFollow"))
    expect(moveBallTo).not.toMatch(/setClubChoice|"auto"/)
  })

  it("through a geometry refresh or a pick of the same hole", () => {
    expect(choiceAfterHolePick("3-Wood", "way/1", "way/1")).toBe("3-Wood")
  })

  it("through a re-rank, including while the new ranking doesn't list it yet", () => {
    const previous = ranked[1]
    expect(chosenPlan(ranked, "3-Wood", null)?.club).toBe("3-Wood")
    // re-ranked: the order changed, the pick still shows
    expect(chosenPlan([plan("Driver", 4.5), plan("3-Wood", 4.6)], "3-Wood", previous)?.club).toBe("3-Wood")
    // pending / not listed yet: keep the last plan for the picked club, not the best
    expect(chosenPlan([plan("4-Iron", 4.6)], "3-Wood", previous)).toBe(previous)
  })

  it("resets on a real hole change, and when the club leaves the bag", () => {
    expect(choiceAfterHolePick("3-Wood", "way/1", "way/2")).toBe("auto")
    expect(choiceAfterHolePick("3-Wood", null, "way/2")).toBe("auto")
    expect(choiceInBag("3-Wood", ["Driver", "4-Iron"])).toBe("auto")
    expect(choiceInBag("3-Wood", ["Driver", "3-Wood"])).toBe("3-Wood")
    expect(choiceInBag("auto", ["Driver"])).toBe("auto")
  })

  it("auto shows the best club", () => {
    expect(chosenPlan(ranked, "auto", ranked[2])?.club).toBe("4-Iron")
  })
})

describe("a pick is for this shot", () => {
  const at = { lat: 40.3, lng: -74.0 }
  const moved = (yds: number) => landingPoint(at, 0, yds, 0)
  it("survives a 10 yd ball move (GPS jitter, a nudge)", () => {
    expect(choiceAfterBallMove("3-Wood", at, moved(10))).toBe("3-Wood")
  })
  it("resets to auto after a 40 yd move (the next shot)", () => {
    expect(NEW_SHOT_YDS).toBe(30)
    expect(choiceAfterBallMove("3-Wood", at, moved(40))).toBe("auto")
  })
  it("auto stays auto, and no ball or pickedAt leaves the pick alone", () => {
    expect(choiceAfterBallMove("auto", at, moved(40))).toBe("auto")
    expect(choiceAfterBallMove("3-Wood", null, moved(40))).toBe("3-Wood")
    expect(choiceAfterBallMove("3-Wood", at, null)).toBe("3-Wood")
  })
})
