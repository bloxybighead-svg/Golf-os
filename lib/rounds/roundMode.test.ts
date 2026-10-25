import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { THEME_INIT_SCRIPT } from "@/lib/theme/themeScript"
import { ACTIVE_ROUND_KEY, holesFor, type ActiveRound } from "./activeRound"
import { ROUND_COMPACT_QUERY, claimOldRound, inRoundMode, isRoundPaused, liveRound, setRoundPaused } from "./roundMode"

const round: ActiveRound = {
  id: "r1",
  course: { id: "c1", name: "Pebble Beach" } as ActiveRound["course"],
  date: "2026-10-11",
  teeName: null,
  courseRating: null,
  slopeRating: null,
  startHole: 7,
  holes: holesFor([7, 8, 9]),
}

afterEach(() => setRoundPaused(false))

describe("inRoundMode", () => {
  it("is on for Play with a round going", () => {
    expect(inRoundMode(round, "/", false)).toBe(true)
  })
  it("is off with no round, on another page, or paused", () => {
    expect(inRoundMode(null, "/", false)).toBe(false)
    expect(inRoundMode(round, "/rounds", false)).toBe(false)
    expect(inRoundMode(round, "/", true)).toBe(false)
  })
  it("pause lives in memory: starts unpaused and toggles", () => {
    expect(isRoundPaused()).toBe(false)
    setRoundPaused(true)
    expect(isRoundPaused()).toBe(true)
  })
})

describe("the inline script that runs before first paint", () => {
  function run(stored: string | null, pathname: string) {
    const dataset: Record<string, string> = {}
    const localStorage = { getItem: (k: string) => (k === ACTIVE_ROUND_KEY ? stored : null) }
    new Function("localStorage", "document", "location", THEME_INIT_SCRIPT)(localStorage, { documentElement: { dataset } }, { pathname })
    return dataset.round
  }
  it("marks round mode on Play, and a round to resume anywhere else", () => {
    expect(run(JSON.stringify(round), "/")).toBe("1")
    expect(run(JSON.stringify(round), "/rounds")).toBe("resume")
  })
  it("marks nothing without a valid round", () => {
    expect(run(null, "/")).toBeUndefined()
    expect(run(JSON.stringify({ ...round, holes: [] }), "/")).toBeUndefined()
    expect(run("not json", "/")).toBeUndefined()
  })
})

describe("globals.css", () => {
  it("hides the chrome under the same query the hooks use", () => {
    const css = readFileSync("app/globals.css", "utf8")
    expect(css).toContain(`@media ${ROUND_COMPACT_QUERY}`)
  })
})

describe("liveRound", () => {
  const now = new Date(2026, 9, 25, 9, 0).getTime()
  const scored = (date: string, id: string): ActiveRound => ({ ...round, id, date, holes: holesFor([1, 2]).map((h) => ({ ...h, strokes: 4 })) })
  it("keeps today's round, so Play opens in round mode", () => {
    const today = scored("2026-10-25", "today")
    expect(inRoundMode(liveRound(today, now), "/", false)).toBe(true)
  })
  it("hides an old scored round until the golfer picks it, so Play is not in round mode and the resume bar has nothing", () => {
    const old = scored("2026-10-09", "old")
    expect(liveRound(old, now)).toBeNull()
    expect(inRoundMode(liveRound(old, now), "/", false)).toBe(false)
    claimOldRound(old.id)
    expect(liveRound(old, now)).toBe(old)
  })
  it("hides a long-abandoned empty round everywhere", () => {
    expect(liveRound({ ...round, id: "empty", date: "2026-10-09" }, now)).toBeNull()
  })
})
