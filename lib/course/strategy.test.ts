import { describe, expect, it } from "vitest"
import { distanceYds, fromLocal, type LatLng } from "./geo"
import { buildLieMap } from "./lies"
import { buildLookahead } from "./lookahead"
import { hasOobBesideLine, obBand, obBandsFor, obZonesFor } from "./obTags"
import { bestAim, evaluateClub, type ClubShots, type OptimizedClubPlan } from "./plan"
import { createRankHandler, rankKey, type LieInputs, type RankMessage } from "./rankRequest"
import { optionsFor, rankWithSpread, tradeoffText } from "./rankOptions"
import { sampleBag, rankColtsNeck, table, TEST_HANDICAP } from "./regressionHarness"
import { getBaseline } from "./baseline"
import { clampSpread } from "./spreadSetting"
import {
  lowestAndSafer,
  needsLookahead,
  OB_MARGIN_YDS,
  ON_COURSE_SPREAD,
  penaltyShare,
  SMART_MAX_PENALTY_RATE,
  widenShots,
} from "./strategy"
import { seededRng } from "@/lib/dispersion/stats"
import { answerBanner, hasAnswered, loadObTags, rowsToMap, toggleSide, withMargin } from "@/lib/planner/obTagStore"
import { cleanHoles } from "@/lib/rounds/holes"
import { holesToAskAboutOb } from "@/lib/rounds/obQuestions"
import { generateFromFittedProfile } from "@/lib/golfer/fitted"
import profileFile from "@/lib/golfer/__fixtures__/synthetic-fitted-profile.json"

const opt = (club: string, strokes: number, penalty: number) => ({ club, strokes, penalty })
const two = (rows: ReturnType<typeof opt>[]) => lowestAndSafer(rows, (r) => r)

describe("the two options", () => {
  it("Smart: a club with lower strokes but 9% penalty loses to a club with slightly higher strokes and 2% penalty", () => {
    const r = two([opt("3-Wood", 4.4, 0.09), opt("5-Wood", 4.45, 0.02), opt("4-Iron", 4.7, 0.0)])
    expect(r?.safer.club).toBe("5-Wood")
    expect(r?.same).toBe(false)
    expect(r?.noSafeOption).toBe(false)
  })

  it("Go for it: the same case picks the 9% club (pure expected strokes, no limit)", () => {
    const r = two([opt("3-Wood", 4.4, 0.09), opt("5-Wood", 4.45, 0.02), opt("4-Iron", 4.7, 0.0)])
    expect(r?.lowest.club).toBe("3-Wood")
  })

  it("Smart: when every club is over 4%, it picks the lowest penalty and says no club is safe", () => {
    const r = two([opt("Driver", 4.0, 0.2), opt("3-Wood", 4.1, 0.09), opt("5-Iron", 4.3, 0.06)])
    expect(r?.safer.club).toBe("5-Iron")
    expect(r?.noSafeOption).toBe(true)
    expect(r?.lowest.club).toBe("Driver")
  })

  it("Smart: with equal lowest penalty (all over the limit) the fewer strokes wins", () => {
    const r = two([opt("Driver", 4.2, 0.06), opt("3-Wood", 4.1, 0.06)])
    expect(r?.safer.club).toBe("3-Wood")
  })

  it("the limit is 4%: exactly 4% is eligible, a hair over is not", () => {
    expect(SMART_MAX_PENALTY_RATE).toBe(0.04)
    expect(two([opt("Driver", 4.0, 0.04), opt("3-Wood", 4.1, 0)])?.safer.club).toBe("Driver")
    expect(two([opt("Driver", 4.0, 0.041), opt("3-Wood", 4.1, 0)])?.safer.club).toBe("3-Wood")
  })

  it("Smart plays each club at its own safe aim, a separate list from Go for it's aims", () => {
    // The Driver is 9% at its strokes-best aim but 3% if aimed away: Smart keeps the Driver (the aim moves, not the club).
    const r = lowestAndSafer([opt("Driver", 4.0, 0.09), opt("3-Wood", 4.1, 0.01)], (x) => x, [opt("Driver", 4.03, 0.03), opt("3-Wood", 4.1, 0.01)], (a, b) => a.club === b.club && a.strokes === b.strokes)
    expect(r?.safer.club).toBe("Driver")
    expect(r?.safer.penalty).toBe(0.03)
    expect(r?.same).toBe(false) // same club, different aim: two options
  })

  it("trees count: the penalty share includes OB, water and trees", () => {
    expect(penaltyShare({ lieShare: { oob: 0.04, water: 0.01, trees: 0.18 } })).toBeCloseTo(0.23, 10)
    expect(penaltyShare({ lieShare: { oob: 0.05, water: 0 } })).toBeCloseTo(0.05, 10) // trees absent counts as none
  })

  it("with no penalty risk anywhere there is one option: the best by strokes", () => {
    const r = two([opt("Driver", 4.0, 0), opt("3-Wood", 4.03, 0), opt("5-Iron", 4.3, 0)])
    expect(r?.same).toBe(true)
    expect(r?.lowest.club).toBe("Driver")
  })

  it("only par 5s and par 4s over 440 yd look ahead", () => {
    expect(needsLookahead(5, 480)).toBe(true)
    expect(needsLookahead(4, 441)).toBe(true)
    expect(needsLookahead(4, 440)).toBe(false)
    expect(needsLookahead(3, 230)).toBe(false)
    expect(needsLookahead(null, 600)).toBe(false)
  })

  it("keeps the spread setting inside 1.0 to 1.5", () => {
    expect(clampSpread(0.5)).toBe(1)
    expect(clampSpread(9)).toBe(1.5)
    expect(clampSpread("1.3")).toBe(1.3)
    expect(clampSpread("junk")).toBe(ON_COURSE_SPREAD)
  })
})

// ---- dispersion -------------------------------------------------------------

const ORIGIN = { lat: 40.3, lng: -74.18 }
const at = (x: number, y: number) => fromLocal(ORIGIN, { x, y })
const box = (x0: number, y0: number, x1: number, y1: number): LatLng[] => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]

function cloud(carry: number, offSd: number, seed: number, mean = 0, n = 800): ClubShots["shots"] {
  const r = seededRng(seed)
  const normal = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())
  return Array.from({ length: n }, () => ({ carryYds: carry + normal() * 6, offlineYds: mean + normal() * offSd }))
}

describe("on-course spread", () => {
  const club: ClubShots = { club: "Driver", shots: cloud(260, 12, 1, -4) }

  it("widens the spread about the club's own mean, keeping its bias and carry", () => {
    const wide = widenShots(club, 1.25)
    const mean = (s: ClubShots) => s.shots.reduce((a, x) => a + x.offlineYds, 0) / s.shots.length
    const sd = (s: ClubShots) => Math.sqrt(s.shots.reduce((a, x) => a + (x.offlineYds - mean(s)) ** 2, 0) / s.shots.length)
    expect(mean(wide)).toBeCloseTo(mean(club), 6)
    expect(sd(wide) / sd(club)).toBeCloseTo(1.25, 6)
    expect(wide.shots.map((s) => s.carryYds)).toEqual(club.shots.map((s) => s.carryYds))
    expect(widenShots(club, 1)).toBe(club)
  })

  it("a wider spread raises the penalty share near a boundary", () => {
    // OB 28 yd right of the aim line: a 12 yd spread rarely reaches it, a wider one more often.
    const lies = buildLieMap(ORIGIN, [{ kind: "fairway", ring: box(-30, 0, 30, 400) }], [], [{ id: "ob", lie: "oob", ring: box(28, 0, 200, 400) }])
    const ctx = { from: at(0, 0), aim: at(0, 260), pin: at(0, 400), lies, startLie: "tee" as const }
    const raw = evaluateClub(club, ctx).lieShare.oob
    const wide = evaluateClub(widenShots(club, 1.5), ctx).lieShare.oob
    expect(wide).toBeGreaterThan(raw)
  })
})

// ---- OB tags ----------------------------------------------------------------

describe("OB tags", () => {
  // A hole straight north from the tee: right is east (+x), left is west (-x).
  const line = [at(0, 0), at(0, 200), at(0, 400)]
  const lieIn = (tags: Parameters<typeof obZonesFor>[2], x: number, y: number) =>
    buildLieMap(ORIGIN, [], [], obZonesFor(line, [], tags)).lieAt(at(x, y))

  it("an OB right tag makes the right side out of bounds, past the fairway edge plus the margin, and not the left", () => {
    const tags = [{ side: "right" as const, marginYds: OB_MARGIN_YDS }]
    expect(lieIn(tags, 50, 250)).toBe("oob")
    expect(lieIn(tags, -50, 250)).not.toBe("oob")
    expect(lieIn(tags, 5, 250)).not.toBe("oob") // the fairway itself
    expect(lieIn(tags, 20, 250)).not.toBe("oob") // inside the default fairway half-width + margin (16 + 15 = 31)
  })

  it("an OB left tag is the mirror image", () => {
    const tags = [{ side: "left" as const, marginYds: OB_MARGIN_YDS }]
    expect(lieIn(tags, -50, 250)).toBe("oob")
    expect(lieIn(tags, 50, 250)).not.toBe("oob")
  })

  it("left and right are as you face the green, whichever way the hole runs", () => {
    // Hole running south: right is WEST.
    const south = [at(0, 400), at(0, 200), at(0, 0)]
    const lies = buildLieMap(ORIGIN, [], [], obZonesFor(south, [], [{ side: "right", marginYds: OB_MARGIN_YDS }]))
    expect(lies.lieAt(at(-50, 200))).toBe("oob")
    expect(lies.lieAt(at(50, 200))).not.toBe("oob")
  })

  it("OB long is beyond the green, and the margin moves the stakes", () => {
    expect(lieIn([{ side: "long", marginYds: OB_MARGIN_YDS }], 0, 480)).toBe("oob")
    expect(lieIn([{ side: "long", marginYds: OB_MARGIN_YDS }], 0, 380)).not.toBe("oob")
    expect(lieIn([{ side: "right", marginYds: 0 }], 20, 250)).toBe("oob")
    expect(lieIn([{ side: "right", marginYds: 40 }], 50, 250)).not.toBe("oob")
  })

  it("measures from a mapped fairway edge when there is one", () => {
    const fairway = { kind: "fairway" as const, ring: box(-30, 0, 30, 400) }
    const zones = obZonesFor(line, [fairway], [{ side: "right", marginYds: 10 }])
    const lies = buildLieMap(ORIGIN, [fairway], [], zones)
    expect(lies.lieAt(at(35, 250))).not.toBe("oob") // 30 edge + 10 margin = 40
    expect(lies.lieAt(at(50, 250))).toBe("oob")
  })

  it("'none' draws nothing, and the edge line follows the band", () => {
    expect(obBandsFor(line, [], [{ side: "none", marginYds: 15 }])).toEqual([])
    const band = obBand("right", line, [], 15)
    expect(band?.edge.length).toBeGreaterThan(2)
    expect(band?.zone.lie).toBe("oob")
  })

  it("the banner question only appears where nothing beside the line is out of bounds", () => {
    const open = buildLieMap(ORIGIN, [], [], [])
    expect(hasOobBesideLine(line, open)).toBe(false)
    const withOb = buildLieMap(ORIGIN, [], [], [{ id: "x", lie: "oob", ring: box(40, 100, 90, 300) }])
    expect(hasOobBesideLine(line, withOb)).toBe(true)
  })

  it("tag edits: toggle, banner answers, margin, saved rows", () => {
    expect(toggleSide([], "right")).toEqual([{ side: "right", marginYds: OB_MARGIN_YDS }])
    expect(toggleSide(toggleSide([], "right"), "right")).toEqual([])
    expect(toggleSide(answerBanner("none"), "left").map((t) => t.side)).toEqual(["left"])
    expect(answerBanner("both").map((t) => t.side)).toEqual(["left", "right"])
    expect(withMargin(answerBanner("both"), 25).every((t) => t.marginYds === 25)).toBe(true)
    expect(hasAnswered([])).toBe(false)
    expect(hasAnswered(answerBanner("none"))).toBe(true)
    expect(rowsToMap([{ hole_id: "way/1", side: "left", margin_yds: 20 }])).toEqual({ "way/1": [{ side: "left", marginYds: 20 }] })
    expect(loadObTags("no-such-course")).toEqual({}) // no localStorage here: never throws
  })
})

// ---- look-ahead ---------------------------------------------------------------

describe("look-ahead on long holes", () => {
  const bag = sampleBag(300, 3)
  const lies = buildLieMap(
    ORIGIN,
    [
      { kind: "fairway", ring: box(-20, 0, 20, 560) },
      { kind: "green", ring: box(-15, 540, 15, 575) },
      { kind: "water", ring: box(-90, 250, -45, 330) },
    ],
    [],
    []
  )
  const holeLine = [at(0, 0), at(0, 560)]
  const base = getBaseline(TEST_HANDICAP)
  const args = { clubs: bag, from: at(0, 0), pin: at(0, 557), line: holeLine, lies, baseline: base }
  const land = (y: number, lie: "fairway" | "water" = "fairway", x = 0) => ({
    point: at(x, y),
    lie,
    carryPoint: at(x, y),
    carryLie: lie,
    carryYds: y,
    totalYds: y,
    lieSource: "mapped" as const,
    dropPoint: null,
  })

  it("values the spots a tee shot can finish with the best next shot, and has no opinion on water", () => {
    const grid = buildLookahead(args)
    expect(grid.cells).toBeGreaterThan(10)
    const v = grid.valueAt(land(270))
    expect(v).not.toBeNull()
    expect(v as number).toBeGreaterThan(2)
    expect(v as number).toBeLessThan(6)
    expect(grid.valueAt(land(290, "water", -60))).toBeNull()
  })

  it("a spot closer to the green is worth no more strokes than one far back", () => {
    const grid = buildLookahead(args)
    expect(grid.valueAt(land(285)) as number).toBeLessThan(grid.valueAt(land(150)) as number)
  })

  it("the tee shot ranking changes when it looks ahead", () => {
    const ctx = { from: at(0, 0), aim: at(0, 557), pin: at(0, 557), lies, startLie: "tee" as const, baseline: base }
    const plain = rankWithSpread(bag, ctx, { spread: 1, line: holeLine })
    const look = rankWithSpread(bag, ctx, { spread: 1, line: holeLine, lookahead: (clubs) => buildLookahead({ ...args, clubs }) })
    const d = (r: OptimizedClubPlan[]) => r.find((x) => x.club === "Driver")!.plan.expectedStrokes
    expect(d(look)).not.toBeCloseTo(d(plain), 3)
  })
})

describe("the ranking worker's spread messages", () => {
  const lies = buildLieMap(ORIGIN, [{ kind: "fairway", ring: box(-30, 0, 30, 420) }], [], [{ id: "ob", lie: "oob", ring: box(34, 0, 200, 420) }])
  const inputs: LieInputs = { origin: ORIGIN, features: [{ kind: "fairway", ring: box(-30, 0, 30, 420) }], coast: [], zones: [{ id: "ob", lie: "oob", ring: box(34, 0, 200, 420) }], extras: {} }
  const rank = (spread: number | undefined): RankMessage => ({
    type: "rank",
    id: 1,
    liesVersion: 1,
    bagVersion: 1,
    from: at(0, 0),
    aim: at(0, 300),
    pin: at(0, 420),
    startLie: "tee",
    line: [at(0, 0), at(0, 420)],
    handicap: 3,
    spread,
    par: 4,
    yards: 420,
  })
  const clubs: ClubShots[] = [
    { club: "Driver", shots: cloud(260, 14, 5, 0, 500) },
    { club: "3-Wood", shots: cloud(235, 10, 6, 0, 500) },
    { club: "5-Iron", shots: cloud(175, 7, 7, 0, 500) },
  ]

  it("a wider spread shows up as more penalty", () => {
    const handle = createRankHandler()
    handle({ type: "lies", version: 1, inputs })
    handle({ type: "bag", version: 1, clubs })
    const narrow = handle(rank(1))!
    const wide = handle(rank(1.5))!
    const pen = (r: typeof wide) => r.results!.reduce((a, x) => a + penaltyShare(x.plan), 0)
    expect(pen(wide)).toBeGreaterThanOrEqual(pen(narrow))
  })

  it("keeps answering the plain way when no spread is named", () => {
    const handle = createRankHandler()
    handle({ type: "lies", version: 1, inputs })
    handle({ type: "bag", version: 1, clubs })
    expect(handle(rank(undefined))!.results).toHaveLength(3)
  })

  it("the spread is part of what a ranking is keyed on", () => {
    const k = { liesVersion: 1, bagVersion: 1, holeId: "h", startLie: "tee" as const, from: at(0, 0), pin: at(0, 400) }
    expect(rankKey({ ...k, spread: 1.25 })).not.toBe(rankKey({ ...k, spread: 1.4 }))
    expect(lies.lieAt(at(50, 100))).toBe("oob")
  })
})

describe("the card's trade-off line", () => {
  const plan = (club: string, strokes: number, oob: number): OptimizedClubPlan =>
    ({ club, bearingDeg: 0, offsetYds: 0, atAimStrokes: strokes, plan: { club, expectedStrokes: strokes, lieShare: { oob, water: 0 } } }) as unknown as OptimizedClubPlan

  it("says what smart play costs and what it saves", () => {
    const o = optionsFor([plan("Driver", 4.43, 0.23), plan("4-Iron", 4.58, 0.01)])!
    expect(tradeoffText(o)).toBe(
      "Smart play: 4-Iron, 1% penalty, 4.58. Go for it: Driver, 23% penalty, 4.43. Smart play costs +0.15 and cuts penalty risk 23% -> 1%."
    )
  })

  it("is quiet when there is only one option", () => {
    expect(tradeoffText(optionsFor([plan("Driver", 4, 0), plan("3-Wood", 4.1, 0)])!)).toBeNull()
  })
})

// ---- rounds -------------------------------------------------------------------

describe("penalty shot on a hole", () => {
  const hole = (extra: Record<string, unknown>) => ({ hole_number: 7, par: 4, strokes: 6, penalty: true, ...extra })

  it("keeps which shot took the penalty, only when there was one", () => {
    expect(cleanHoles([hole({ penalty_shot: "tee" })])[0].penalty_shot).toBe("tee")
    expect(cleanHoles([hole({ penalty_shot: "approach" })])[0].penalty_shot).toBe("approach")
    expect(cleanHoles([hole({ penalty: false, penalty_shot: "tee" })])[0].penalty_shot).toBeNull()
    expect(cleanHoles([hole({ penalty_shot: "nonsense" })])[0].penalty_shot).toBeNull()
    expect(cleanHoles([hole({})])[0].penalty_shot).toBeNull()
  })

  it("asks about OB only for a tee-shot penalty that has no answer yet", () => {
    const holes = [
      { hole_number: 3, penalty: true, penalty_shot: "tee" as const },
      { hole_number: 7, penalty: true, penalty_shot: "approach" as const },
      { hole_number: 9, penalty: true, penalty_shot: null },
      { hole_number: 12, penalty: true, penalty_shot: "tee" as const },
      { hole_number: 14, penalty: false, penalty_shot: null },
    ]
    expect(holesToAskAboutOb(holes, () => false)).toEqual([3, 12])
    expect(holesToAskAboutOb(holes, (n) => n === 3)).toEqual([12])
  })
})

// ---- regression: synthetic golfer ---------------------------------------------------

describe("fitted profile generator", () => {
  it("reproduces the fitted driver's mean carry and is repeatable from its seed", () => {
    const a = generateFromFittedProfile(profileFile.profile, 2000, 11).find((c) => c.club === "Driver")!
    const b = generateFromFittedProfile(profileFile.profile, 2000, 11).find((c) => c.club === "Driver")!
    expect(a.shots).toEqual(b.shots)
    const mean = a.shots.reduce((s, x) => s + x.carryYds, 0) / a.shots.length
    expect(Math.abs(mean - 266.5)).toBeLessThan(4) // fitted mean_carry 266.5
  })
})

describe("Colts Neck regression cases (synthetic fitted profile and hand-drawn marks, ON_COURSE_SPREAD 1.25)", () => {
  it("hole 3 (par 5): Go for it is the Driver at a big penalty share; smart play is the 3-Wood, 7-Wood or 4-Iron and gives up little", () => {
    const c = rankColtsNeck(3, [])
    const msg = `Hole 3: smart play ${c.options.safer.club}, go for it ${c.options.lowest.club}. Per club:\n${table(c.ranking)}`
    expect(c.options.lowest.club, msg).toBe("Driver")
    expect(penaltyShare(c.options.lowest.plan), msg).toBeGreaterThan(0.15) // OB plus trees; about 0.2 with the synthetic profile
    expect(["3-Wood", "7-Wood", "4-Iron"], msg).toContain(c.options.safer.club)
    expect(penaltyShare(c.options.safer.plan), msg).toBeLessThan(0.1)
  })

  it("hole 3 with an OB-right tag on top: same shape of answer", () => {
    const c = rankColtsNeck(3, [{ side: "right", marginYds: OB_MARGIN_YDS }])
    const msg = `Hole 3 + OB right: smart play ${c.options.safer.club}, go for it ${c.options.lowest.club}. Per club:\n${table(c.ranking)}`
    expect(c.options.lowest.club, msg).toBe("Driver")
    expect(["3-Wood", "7-Wood", "4-Iron"], msg).toContain(c.options.safer.club)
  })

  it("hole 3: smart play is a wood or the 4-Iron across shot seeds, not an artefact of one sample", () => {
    for (const seed of [1, 2, 3, 4]) {
      const c = rankColtsNeck(3, [], { clubs: sampleBag(1000, seed) })
      expect(["3-Wood", "7-Wood", "4-Iron"], `seed ${seed}\n${table(c.ranking)}`).toContain(c.options.safer.club)
    }
  })

  it("hole 6 (par 5): smart play never carries more risk than Go for it and never gives up more than the limit", () => {
    const c = rankColtsNeck(6, [])
    const msg = `Hole 6: smart play ${c.options.safer.club}, go for it ${c.options.lowest.club}. Per club:\n${table(c.ranking)}`
    expect(c.options.lowest.club, msg).toBe("Driver")
    expect(penaltyShare(c.options.safer.plan), msg).toBeLessThanOrEqual(penaltyShare(c.options.lowest.plan))
  })
})

describe("counter-case: a long, wide par 4 with minor OB", () => {
  // 470 yd, fairway 70 wide, OB only far to the right (45 yd off the fairway edge) and far behind the green.
  const lies = buildLieMap(
    ORIGIN,
    [
      { kind: "fairway", ring: box(-35, 0, 35, 470) },
      { kind: "green", ring: box(-15, 455, 15, 485) },
    ],
    [],
    [{ id: "ob", lie: "oob", ring: box(85, 150, 300, 470) }]
  )
  it("Driver is both options: smart play does not lay back (3-Wood leaves 200+, the Driver is under the cap)", () => {
    const base = getBaseline(TEST_HANDICAP)
    const from = at(0, 0)
    const pin = at(0, 470)
    const ranking = rankWithSpread(sampleBag(), { from, aim: pin, pin, lies, startLie: "tee", baseline: base }, { spread: ON_COURSE_SPREAD, line: [from, pin] })
    const o = optionsFor(ranking)!
    const wood = ranking.find((r) => r.club === "3-Wood")!
    const msg = `Smart play ${o.safer.club}, go for it ${o.lowest.club}. Per club:\n${table(ranking)}`
    expect(distanceYds(from, pin) - wood.plan.meanTotalYds, msg).toBeGreaterThan(200)
    expect(penaltyShare(o.lowest.plan), msg).toBeLessThanOrEqual(SMART_MAX_PENALTY_RATE)
    expect(o.lowest.club, msg).toBe("Driver")
    expect(o.safer.club, msg).toBe("Driver")
  })
})

describe("aiming away from trouble (Smart play's aim search)", () => {
  // Fairway 60 wide with OB starting 22 yd right of the line: the plain-strokes aim is not necessarily safe.
  const lies = buildLieMap(
    ORIGIN,
    [
      { kind: "fairway", ring: box(-30, 0, 30, 470) },
      { kind: "green", ring: box(-15, 455, 15, 485) },
    ],
    [],
    [{ id: "ob", lie: "oob", ring: box(22, 150, 300, 470) }]
  )
  const from = at(0, 0)
  const pin = at(0, 470)
  const ctx = { from, aim: pin, pin, lies, startLie: "tee" as const, baseline: getBaseline(TEST_HANDICAP) }
  const driver = widenShots(sampleBag().find((c) => c.club === "Driver")!, ON_COURSE_SPREAD)

  it("with a limit, the aim search finds an aim at or under it where one exists, and never has more penalty than the strokes-best aim", () => {
    const r = bestAim(driver, ctx, 60, 2, SMART_MAX_PENALTY_RATE)
    expect(r.safe).toBeDefined()
    expect(penaltyShare(r.safe!.plan)).toBeLessThanOrEqual(penaltyShare(r.plan) + 1e-9)
    // The safe aim moves away from the OB side (left, negative) of the strokes-best one.
    expect(r.safe!.offsetYds).toBeLessThanOrEqual(r.offsetYds)
    expect(penaltyShare(r.safe!.plan)).toBeLessThan(0.1)
  })

  it("without a limit there is no safe aim (Go for it's search is unchanged)", () => {
    expect(bestAim(driver, ctx).safe).toBeUndefined()
  })
})

describe("speed", () => {
  it("ranks a par 5's tee shot with look-ahead in a reasonable time", () => {
    const c = rankColtsNeck(3, [{ side: "right", marginYds: OB_MARGIN_YDS }])
    // Desktop budget only; the phone budget is checked by hand (see the session notes). Generous so CI noise can't flake it.
    expect(c.ms).toBeLessThan(3000)
  })
})
