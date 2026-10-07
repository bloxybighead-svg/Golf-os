import { SMART_MAX_PENALTY_RATE } from "./strategy"
import { describe, expect, it } from "vitest"
import { distanceYds, fromLocal, toLocal, type LatLng } from "./geo"
import { buildLieMap } from "./lies"
import {
  aimMarkerFor,
  aimOffsetLabel,
  centerlineAim,
  evaluateClub,
  isAtBestAim,
  isTie,
  rankClubs,
  rankClubsOptimized,
  rankingShots,
  RANKING_SHOT_CAP,
  type ClubShots,
} from "./plan"
import { seededRng } from "@/lib/dispersion/stats"
import { createRankHandler, LruCache, rankKey, type LieInputs, type RankMessage, type RankReply } from "./rankRequest"

const ORIGIN = { lat: 36.5685, lng: -121.949 }
const at = (x: number, y: number) => fromLocal(ORIGIN, { x, y })
const rect = (x0: number, y0: number, x1: number, y1: number): LatLng[] => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]
/** Signed angle a - b in degrees, -180..180. */
const angle = (a: number, b: number) => ((a - b + 540) % 360) - 180

// A dogleg right: 200 yd straight up, then 45 degrees right to a green at (140, 340).
// Fairway 30 yd wide on both legs, mapped woods filling the inside of the corner;
// everything else unmapped (rough).
const line = [at(0, 0), at(0, 200), at(140, 340)]
const pin = at(140, 340)
function leg(a: { x: number; y: number }, b: { x: number; y: number }, halfWidth: number): LatLng[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const px = ((b.y - a.y) / len) * halfWidth
  const py = (-(b.x - a.x) / len) * halfWidth
  return [at(a.x + px, a.y + py), at(b.x + px, b.y + py), at(b.x - px, b.y - py), at(a.x - px, a.y - py)]
}
const doglegInputs: LieInputs = {
  origin: ORIGIN,
  features: [
    { kind: "fairway", ring: leg({ x: 0, y: 90 }, { x: 0, y: 215 }, 15) },
    { kind: "fairway", ring: leg({ x: -10, y: 190 }, { x: 125, y: 325 }, 15) },
    { kind: "green", ring: rect(125, 325, 155, 355) },
    { kind: "trees", ring: rect(16, 95, 140, 175) },
  ],
  coast: [],
  zones: [],
  extras: {},
}
const dogleg = buildLieMap(doglegInputs.origin, doglegInputs.features)

function pattern(carry: number, carrySpread: number, offSpread: number, seed: number, n = 400): ClubShots["shots"] {
  const r = seededRng(seed)
  return Array.from({ length: n }, () => ({ carryYds: carry + (r() - 0.5) * 2 * carrySpread, offlineYds: (r() - 0.5) * 2 * offSpread }))
}
const driver: ClubShots = { club: "Driver", shots: pattern(255, 10, 12, 1) }
const sevenIron: ClubShots = { club: "7-Iron", shots: pattern(160, 6, 8, 2) }
const wildFourIron: ClubShots = { club: "4-Iron", shots: pattern(190, 6, 130, 4) } // sprays it everywhere, whatever the aim
const tee = { from: ORIGIN, pin, lies: dogleg, startLie: "tee" as const }

describe("ranking each club at its own aim", () => {
  it("on a dogleg right, the long club's best aim is right of the short club's", () => {
    const ranked = rankClubsOptimized([driver, sevenIron], { ...tee, aim: pin }, { line })
    const d = ranked.find((r) => r.club === "Driver")!
    const i7 = ranked.find((r) => r.club === "7-Iron")!
    expect(angle(d.bearingDeg, i7.bearingDeg)).toBeGreaterThan(5)
    // each lands mostly on its own leg's fairway
    expect(d.plan.lieShare.fairway).toBeGreaterThan(0.7)
    expect(i7.plan.lieShare.fairway).toBeGreaterThan(0.7)
  })

  it("a club that's poor at the shared aim but good at its own moves up the ranking", () => {
    // The shared aim is the driver's corner: the 7-iron, aimed there, flies into the mapped woods.
    const cornerAim = at(62, 262)
    const shared = rankClubs([sevenIron, wildFourIron], { ...tee, aim: cornerAim }).map((r) => r.club)
    const own = rankClubsOptimized([sevenIron, wildFourIron], { ...tee, aim: cornerAim }, { line })
    expect(shared).toEqual(["4-Iron", "7-Iron"])
    expect(own.map((r) => r.club)).toEqual(["7-Iron", "4-Iron"])
    expect(isTie(own[1].plan, own[0].plan)).toBe(false)
  })

  it("reports each club's strokes at the aim marker, on the same held-out shots, for comparison", () => {
    const cornerAim = at(62, 262)
    const [i7] = rankClubsOptimized([sevenIron], { ...tee, aim: cornerAim }, { line })
    expect(i7.atAimStrokes).toBeGreaterThan(i7.plan.expectedStrokes + 0.1)
    expect(i7.plan.n).toBe(200) // the held-out half of 400
  })

  it("centres on the aim marker when there's no hole line", () => {
    const [a] = rankClubsOptimized([sevenIron], { ...tee, aim: at(0, 160) }, { line: null, maxOffsetYds: 0 })
    expect(Math.abs(angle(a.bearingDeg, 0))).toBeLessThan(0.01)
    expect(a.offsetYds).toBe(0)
  })

  it("uses a fixed-seed sample of RANKING_SHOT_CAP shots when a club has more", () => {
    const big: ClubShots = { club: "7-Iron", shots: pattern(160, 6, 8, 9, 1000) }
    expect(rankingShots(big).shots).toHaveLength(RANKING_SHOT_CAP)
    expect(rankingShots(big)).toEqual(rankingShots(big))
    expect(rankingShots(sevenIron)).toBe(sevenIron)
  })
})

describe("centerlineAim", () => {
  it("finds the point on the centre line the club reaches, around the corner if need be", () => {
    const short = toLocal(ORIGIN, centerlineAim(line, ORIGIN, 150)!)
    expect(short.x).toBeCloseTo(0, 5)
    expect(short.y).toBeCloseTo(150, 0)
    const long = centerlineAim(line, ORIGIN, 270)!
    expect(distanceYds(ORIGIN, long)).toBeGreaterThanOrEqual(270)
    expect(distanceYds(ORIGIN, long)).toBeLessThan(273)
    expect(toLocal(ORIGIN, long).x).toBeGreaterThan(50) // on the second leg
  })

  it("aims at the pin when the club goes past the end, and gives up without a line or far off it", () => {
    expect(centerlineAim(line, ORIGIN, 500, pin)).toEqual(pin)
    expect(centerlineAim(null, ORIGIN, 150)).toBeNull()
    expect(centerlineAim(line, at(300, 0), 150)).toBeNull() // 300 yd off the line
  })
})

describe("ties", () => {
  const best = { expectedStrokes: 4.0, strokesSe: 0.03 }
  it("calls a gap within 1 SE of the difference a tie", () => {
    // SE of the difference = hypot(0.03, 0.04) = 0.05
    expect(isTie({ expectedStrokes: 4.05, strokesSe: 0.04 }, best)).toBe(true)
    expect(isTie({ expectedStrokes: 4.049, strokesSe: 0.04 }, best)).toBe(true)
    expect(isTie({ expectedStrokes: 4.051, strokesSe: 0.04 }, best)).toBe(false)
    expect(isTie(best, best)).toBe(false) // the best club isn't tied with itself
  })

  it("the standard error shrinks with more shots and is zero when every shot scores the same", () => {
    const ctx = { ...tee, aim: at(0, 160) }
    const few = evaluateClub({ club: "7-Iron", shots: pattern(160, 6, 30, 3, 50) }, ctx)
    const many = evaluateClub({ club: "7-Iron", shots: pattern(160, 6, 30, 3, 800) }, ctx)
    expect(few.strokesSe).toBeGreaterThan(many.strokesSe * 2)
    const same = evaluateClub({ club: "7-Iron", shots: Array.from({ length: 10 }, () => ({ carryYds: 160, offlineYds: 0 })) }, ctx)
    expect(same.strokesSe).toBeCloseTo(0, 12)
  })
})

describe("table and aim-marker helpers", () => {
  it("labels the aim offset", () => {
    expect(aimOffsetLabel(0)).toBe("center")
    expect(aimOffsetLabel(-6)).toBe("6 L")
    expect(aimOffsetLabel(12)).toBe("12 R")
  })

  it("puts the marker at the club's finish, or on the pin when it aims at the pin and reaches it", () => {
    const [i7] = rankClubsOptimized([sevenIron], { ...tee, aim: pin }, { line })
    const marker = aimMarkerFor(ORIGIN, pin, i7)
    expect(distanceYds(ORIGIN, marker)).toBeCloseTo(i7.plan.meanTotalYds, 5)
    expect(isAtBestAim(ORIGIN, marker, i7)).toBe(true)
    expect(isAtBestAim(ORIGIN, at(40, 160), i7)).toBe(false)
    const near = at(0, 150)
    expect(aimMarkerFor(ORIGIN, near, { bearingDeg: 0, plan: i7.plan })).toEqual(near)
  })
})

describe("the ranking worker", () => {
  const clubs = [driver, sevenIron, wildFourIron]
  const rank: RankMessage = { type: "rank", id: 7, liesVersion: 1, bagVersion: 1, from: ORIGIN, aim: pin, pin, startLie: "tee", line }

  it("gives exactly the same ranking as calling rankClubsOptimized directly", async () => {
    const replies: RankReply[] = []
    const fakeScope: { onmessage: ((e: { data: RankMessage }) => void) | null; postMessage: (r: RankReply) => void } = {
      onmessage: null,
      postMessage: (r) => replies.push(r),
    }
    const g = globalThis as unknown as { self?: unknown }
    const saved = g.self
    g.self = fakeScope
    try {
      await import("./plan.worker")
    } finally {
      g.self = saved
    }
    // Messages go through structuredClone, as postMessage would copy them.
    const post = (m: RankMessage) => fakeScope.onmessage!({ data: structuredClone(m) })
    post({ type: "lies", version: 1, inputs: doglegInputs })
    post({ type: "bag", version: 1, clubs })
    post(rank)
    expect(replies).toHaveLength(1)
    expect(replies[0].id).toBe(7)
    const direct = rankClubsOptimized(clubs, { ...tee, aim: pin }, { line, maxPenalty: SMART_MAX_PENALTY_RATE })
    expect(replies[0].results).toEqual(direct)
  })

  it("refuses a request made for a map or bag it doesn't have", () => {
    const handle = createRankHandler()
    handle({ type: "lies", version: 1, inputs: doglegInputs })
    handle({ type: "bag", version: 1, clubs })
    expect(handle({ ...rank, bagVersion: 2 } as RankMessage)?.results).toBeNull()
    expect(handle({ ...rank, liesVersion: 0 } as RankMessage)?.results).toBeNull()
  })

  it("keys the cache on the stance but not the aim, and keeps the most recent entries", () => {
    const k = { liesVersion: 1, bagVersion: 1, holeId: "h1", startLie: "tee" as const, from: ORIGIN, pin }
    expect(rankKey(k)).toBe(rankKey({ ...k }))
    expect(rankKey({ ...k, from: at(0, 1) })).not.toBe(rankKey(k))
    expect(rankKey({ ...k, bagVersion: 2 })).not.toBe(rankKey(k))
    const c = new LruCache<number>(2)
    c.set("a", 1)
    c.set("b", 2)
    c.get("a") // a is now the most recent
    c.set("c", 3)
    expect(c.get("b")).toBeUndefined()
    expect(c.get("a")).toBe(1)
    expect(c.get("c")).toBe(3)
  })
})
