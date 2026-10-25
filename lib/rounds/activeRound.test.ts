import { afterEach, describe, it, expect, vi } from "vitest"
import { ACTIVE_ROUND_KEY, describeOrder, holeToScore, holesFor, loadActiveRound, newRoundId, nextUnscored, playOrder, ratingForHoles, saveActiveRound, scoreToParLabel, staleness, type ActiveRound } from "./activeRound"

describe("playOrder", () => {
  it("plays 18 from the first", () => {
    expect(playOrder(1, 18)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
  })
  it("knows a back nine: 9 holes starting on 10", () => {
    expect(playOrder(10, 9)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
  })
  it("wraps past 18 for other counts", () => {
    expect(playOrder(10, 12)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3])
    expect(playOrder(17, 4)).toEqual([17, 18, 1, 2])
  })
  it("never repeats a hole on a 9-hole course", () => {
    expect(playOrder(5, 18, 9)).toEqual([5, 6, 7, 8, 9, 1, 2, 3, 4])
  })
})

describe("describeOrder", () => {
  it("names the stretch of holes, split where it wraps", () => {
    expect(describeOrder(playOrder(10, 9))).toBe("10–18")
    expect(describeOrder(playOrder(10, 12))).toBe("10–18, 1–3")
    expect(describeOrder([7])).toBe("7")
  })
})

describe("holesFor", () => {
  it("takes pars from the course and falls back to 4", () => {
    const holes = holesFor([10, 11, 12], { 10: 5, 11: 3, 12: null })
    expect(holes.map((h) => [h.hole_number, h.par])).toEqual([[10, 5], [11, 3], [12, 4]])
    expect(holes.every((h) => h.strokes == null)).toBe(true)
  })
})

describe("ratingForHoles", () => {
  it("is the tee's rating for 18 and its share for fewer", () => {
    expect(ratingForHoles(73.4, 18)).toBe(73.4)
    expect(ratingForHoles(73.4, 9)).toBe(36.7)
    expect(ratingForHoles(72, 12)).toBe(48)
  })
})

describe("nextUnscored", () => {
  it("is the first hole in play order without a score", () => {
    const holes = holesFor(playOrder(10, 3))
    holes[0].strokes = 4
    const round = { holes } as ActiveRound
    expect(nextUnscored(round)).toBe(11)
    holes[1].strokes = 5
    holes[2].strokes = 3
    expect(nextUnscored(round)).toBeNull()
  })
})

describe("newRoundId", () => {
  // The same shape createRound (app/rounds/actions.ts) accepts as rounds.id.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  it("makes a UUID the server accepts, and a different one each time", () => {
    const ids = Array.from({ length: 50 }, () => newRoundId())
    expect(ids.every((id) => UUID.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(50)
  })
})

describe("scoreToParLabel", () => {
  const base: ActiveRound = {
    id: "r1",
    course: { id: "c1", name: "Pebble Beach" } as ActiveRound["course"],
    date: "2026-10-11",
    teeName: null,
    courseRating: null,
    slopeRating: null,
    startHole: 1,
    holes: holesFor([1, 2], { 1: 4, 2: 3 }),
  }
  it("is null until a hole is scored", () => {
    expect(scoreToParLabel(base)).toBeNull()
  })
  it("is the score against the par of the holes played", () => {
    const scored = (...strokes: number[]) => ({ ...base, holes: base.holes.map((h, i) => ({ ...h, strokes: strokes[i] ?? null })) })
    expect(scoreToParLabel(scored(6))).toBe("+2")
    expect(scoreToParLabel(scored(4, 3))).toBe("E")
    expect(scoreToParLabel(scored(3, 3))).toBe("-1")
  })
})

describe("holeToScore", () => {
  const round = { holes: holesFor(playOrder(10, 3)) } as ActiveRound
  it("is the hole the map is on when it is in the round", () => {
    expect(holeToScore(round, 11)).toBe(11)
  })
  it("is the next hole without a score when the map is elsewhere or on no hole", () => {
    round.holes[0].strokes = 4
    expect(holeToScore(round, 3)).toBe(11)
    expect(holeToScore(round, null)).toBe(11)
  })
  it("falls back to the first hole when every hole is scored", () => {
    for (const h of round.holes) h.strokes = 4
    expect(holeToScore(round, null)).toBe(10)
  })
})

describe("staleness", () => {
  const now = new Date(2026, 9, 25, 9, 0).getTime() // Oct 25, 9:00 local
  const make = (over: Partial<ActiveRound>, scores = 0): ActiveRound => {
    const holes = holesFor(playOrder(1, 18))
    holes.slice(0, scores).forEach((h) => (h.strokes = 4))
    return { id: "r", course: { id: "c" } as ActiveRound["course"], date: "2026-10-25", teeName: null, courseRating: null, slopeRating: null, startHole: 1, holes, ...over }
  }
  it("drops a round with no scores 13 hours after it started, keeps one at 11", () => {
    expect(staleness(make({ startedAt: now - 13 * 3600_000 }), now)).toBe("empty-stale")
    expect(staleness(make({ startedAt: now - 11 * 3600_000 }), now)).toBe("fresh")
  })
  it("counts a round without startedAt from midnight on its date", () => {
    expect(staleness(make({ date: "2026-10-24" }), now)).toBe("empty-stale")
    expect(staleness(make({ date: "2026-10-25" }), now)).toBe("fresh")
  })
  it("asks about a scored round from an earlier day, never about today's", () => {
    expect(staleness(make({ date: "2026-10-09" }, 11), now)).toBe("old")
    expect(staleness(make({ date: "2026-10-25", startedAt: now - 20 * 3600_000 }, 11), now)).toBe("fresh")
  })
})

describe("saveActiveRound(null)", () => {
  afterEach(() => vi.unstubAllGlobals())
  it("clears the stored round", () => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })
    const r = { id: "r", course: { id: "c" }, date: "2026-10-09", holes: holesFor([1]) } as ActiveRound
    saveActiveRound(r)
    expect(loadActiveRound()?.id).toBe("r")
    saveActiveRound(null)
    expect(store.has(ACTIVE_ROUND_KEY)).toBe(false)
  })
})
