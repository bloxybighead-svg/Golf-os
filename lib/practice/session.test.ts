import { describe, it, expect } from "vitest"
import type { LibraryDrill } from "@/lib/supabase/types"
import { buildSession, type HistorySet, type NextRound, type SessionPlan } from "./session"
import type { WeekItem } from "./week"

let n = 0
const drill = (o: Partial<LibraryDrill> & Pick<LibraryDrill, "name" | "practice_category">): LibraryDrill => ({
  id: `d${++n}`,
  category: "putting",
  description: null,
  target_area: null,
  difficulty: "intermediate",
  reps_suggested: null,
  time_estimate_mins: 20,
  instructions: null,
  equipment_needed: null,
  locations: ["range"],
  equipment: null,
  structure: "blocked",
  pressure: 0,
  metric: "count_of_n",
  lower_is_better: false,
  sets: [{ label: "Set 1", setup: "x", balls: 10 }],
  levels: [{ name: "L0", rule: "easy" }, { name: "L1", rule: "hard" }],
  cue: "Roll it to the target.",
  routine_rule: "Full routine.",
  source_url: "https://example.com",
  status: "active",
  ...o,
})

const speed = drill({ name: "Speed Calibration", practice_category: "warmup", time_estimate_mins: 5 })
const closeout = drill({ name: "Three 4-Footers", practice_category: "closeout", time_estimate_mins: 5, pressure: 2 })
const lagA = drill({ name: "Pelz Lag Ladder", practice_category: "lag_putting" })
const lagB = drill({ name: "Mickelson Lag Stations", practice_category: "lag_putting", structure: "random" })
const shortA = drill({ name: "3-Foot Circle", practice_category: "short_putting" })
const shortB = drill({ name: "Putting Gate", practice_category: "short_putting" })
const chips = drill({ name: "Landing Spot Towel", practice_category: "short_game" })
const wedges = drill({ name: "Wedge Matrix", practice_category: "wedges", structure: "random" })
const approachA = drill({ name: "Range Nine Holes", practice_category: "approach", structure: "random" })
const approachB = drill({ name: "Approach Blocked", practice_category: "approach" })
const clubWork = drill({ name: "Club Work", practice_category: "approach", structure: "blocked_serial_random", time_estimate_mins: 30 })
const tee = drill({ name: "Fairway Corridor", practice_category: "tee" })
const netOnly = drill({ name: "Net Only", practice_category: "approach", locations: ["home_net"] })
const closed = drill({ name: "Closed Drill", practice_category: "approach", status: "closed" })
const locked = drill({ name: "Nine Windows", practice_category: "approach", status: "locked" })
const library = [speed, closeout, lagA, lagB, shortA, shortB, chips, wedges, approachA, approachB, clubWork, tee, netOnly, closed, locked]

const item = (area: WeekItem["area"], priority: number, extra: Partial<WeekItem> = {}): WeekItem => ({ area, required: 2, done: 0, priority, minutes: 25, ...extra })
const week = [item("approach", 1.0), item("lag_putting", 0.8), item("short_putting", 0.6), item("short_game", 0.5), item("wedges", 0.4), item("tee", 0.1)]

const wed = (h: number, m = 0) => new Date(2026, 9, 21, h, m)
const plan = (o: Partial<Parameters<typeof buildSession>[0]> = {}): SessionPlan =>
  buildSession({ week, now: wed(10), minutes: 120, locations: ["range"], energy: "ok", nextRound: null, history: [], library, levels: {}, ...o })
const names = (p: SessionPlan) => p.blocks.map((b) => b.name)
const scoredAll: HistorySet[] = library.map((d) => ({ drillId: d.id, at: new Date(2026, 9, 1), skipped: false }))
const round = (daysAhead: number, o: Partial<NextRound> = {}): NextRound => ({ date: new Date(2026, 9, 21 + daysAhead, 14), competitive: false, courseKnown: true, ...o })

describe("device cutoff", () => {
  it("gives a 19:30 start 70 minutes and ends logging at 20:45", () => {
    const p = plan({ now: wed(19, 30) })
    expect(p.practiceMinutes).toBe(70)
    expect(p.endsAt).toEqual(wed(20, 45))
    expect(p.notes.join(" ")).toContain("8:45")
  })

  it("leaves a session that already fits alone", () => {
    const p = plan({ now: wed(10), minutes: 60 })
    expect(p.practiceMinutes).toBe(60)
    expect(p.notes.join(" ")).not.toContain("8:45")
  })

  it("plans nothing after the cutoff", () => {
    expect(plan({ now: wed(20, 50) }).blocks).toEqual([])
  })
})

describe("pain", () => {
  it("allows only putting and chipping, 60 minutes at most", () => {
    const p = plan({ energy: "pain", locations: ["range"], library: library.map((d) => ({ ...d, locations: ["range"] })) })
    expect(p.practiceMinutes).toBeLessThanOrEqual(60)
    expect(p.blocks.every((b) => ["lag_putting", "short_putting", "short_game", "warmup", "closeout"].includes(b.category))).toBe(true)
    expect(p.blocks.length).toBeGreaterThan(0)
  })
})

describe("day before a round", () => {
  it("is 60 minutes at most, lag speed and close-out only, nothing never scored", () => {
    const history = scoredAll.filter((s) => s.drillId !== lagB.id)
    const p = plan({ nextRound: round(1), history })
    expect(p.practiceMinutes).toBeLessThanOrEqual(60)
    expect(p.blocks.every((b) => ["lag_putting", "warmup", "closeout"].includes(b.category))).toBe(true)
    expect(names(p)).not.toContain(lagB.name)
    expect(names(p)).toContain(lagA.name)
  })

  it("plans no drill the golfer has never scored", () => {
    expect(plan({ nextRound: round(1), history: [] }).blocks).toEqual([])
  })
})

describe("competitive round within 3 days", () => {
  it.each([0, 1, 2, 3])("always includes Club Work (round in %i days)", (days) => {
    if (days === 0) return
    const p = plan({ nextRound: round(days, { competitive: true }), history: scoredAll })
    expect(names(p)).toContain("Club Work")
    expect(p.blocks.find((b) => b.name === "Club Work")?.kind).toBe("club_work")
  })

  it("does not add it for a casual round or one 4 days out", () => {
    const kinds = (p: SessionPlan) => p.blocks.map((b) => b.kind)
    expect(kinds(plan({ nextRound: round(2) }))).not.toContain("club_work")
    expect(kinds(plan({ nextRound: round(4, { competitive: true }) }))).not.toContain("club_work")
  })

  it("notes when the location cannot host it", () => {
    const p = plan({ nextRound: round(2, { competitive: true }), library: library.map((d) => ({ ...d, locations: d.name === "Club Work" ? ["range"] : ["putting_green"] })), locations: ["putting_green"] })
    expect(names(p)).not.toContain("Club Work")
    expect(p.notes.join(" ")).toContain("Club Work")
  })
})

describe("unfamiliar course", () => {
  it("puts more minutes into lag putting and approach", () => {
    const minutes = (p: SessionPlan, cat: string) => p.blocks.filter((b) => b.category === cat).reduce((s, b) => s + b.minutes, 0)
    const known = plan({ nextRound: round(5), library: library.map((d) => ({ ...d, locations: ["range"] })) })
    const unknown = plan({ nextRound: round(5, { courseKnown: false }), library: library.map((d) => ({ ...d, locations: ["range"] })) })
    expect(minutes(unknown, "lag_putting") + minutes(unknown, "approach")).toBeGreaterThan(minutes(known, "lag_putting") + minutes(known, "approach"))
  })
})

describe("playing that day", () => {
  it("is one pre-round block of 25-30 minutes", () => {
    const p = plan({ nextRound: round(0) })
    expect(p.blocks).toHaveLength(1)
    expect(p.blocks[0].minutes).toBeGreaterThanOrEqual(25)
    expect(p.blocks[0].minutes).toBeLessThanOrEqual(30)
    expect(p.blocks[0].kind).toBe("pre_round")
  })

  it("is Club Work before a competitive round", () => {
    const p = plan({ nextRound: round(0, { competitive: true }) })
    expect(p.blocks.map((b) => b.name)).toEqual(["Club Work"])
  })
})

describe("six practice days in a row", () => {
  const day = (back: number): HistorySet => ({ drillId: lagA.id, at: new Date(2026, 9, 21 - back, 12), skipped: false })

  it("makes today an off day", () => {
    const p = plan({ history: [1, 2, 3, 4, 5, 6].map(day) })
    expect(p.off).toBe(true)
    expect(p.blocks).toEqual([])
    expect(p.notes.join(" ")).toContain("off day")
  })

  it("does not at five in a row, or when a day was only skipped sets", () => {
    expect(plan({ history: [1, 2, 3, 4, 5].map(day) }).off).toBe(false)
    expect(plan({ history: [1, 2, 3, 4, 5, 6].map((b) => (b === 3 ? { ...day(b), skipped: true } : day(b))) }).off).toBe(false)
  })
})

describe("allocation", () => {
  const allHere = library.map((d) => ({ ...d, locations: ["range" as const] }))
  const p = plan({ library: allHere })
  const share = (cats: string[]) => p.blocks.filter((b) => cats.includes(b.category)).reduce((s, b) => s + b.minutes, 0) / p.practiceMinutes

  it("orders putting first, warm-up first, close-out last", () => {
    expect(p.blocks[0].kind).toBe("warmup")
    expect(p.blocks[p.blocks.length - 1].kind).toBe("closeout")
    const firstFullSwing = p.blocks.findIndex((b) => !["warmup", "lag_putting", "short_putting"].includes(b.category))
    const lastPutting = Math.max(...p.blocks.map((b, i) => (["lag_putting", "short_putting"].includes(b.category) ? i : -1)))
    expect(lastPutting).toBeLessThan(firstFullSwing)
  })

  it("runs blocked drills before random ones outside putting", () => {
    const rest = p.blocks.filter((b) => !["warmup", "lag_putting", "short_putting", "closeout"].includes(b.category))
    const rank = (name: string) => ({ blocked: 0, blocked_serial_random: 1, random: 2 })[allHere.find((d) => d.name === name)!.structure!]
    expect(rest.map((b) => rank(b.name))).toEqual([...rest.map((b) => rank(b.name))].sort())
  })

  it("gives putting at least 25%, any area at most 40%, and no block under 10 minutes", () => {
    expect(share(["warmup", "closeout", "lag_putting", "short_putting"])).toBeGreaterThanOrEqual(0.25)
    for (const cat of ["lag_putting", "short_putting", "short_game", "wedges", "approach", "tee"]) expect(share([cat])).toBeLessThanOrEqual(0.4 + 1e-9)
    for (const b of p.blocks.filter((x) => x.kind === "drill" || x.kind === "club_work")) expect(b.minutes).toBeGreaterThanOrEqual(10)
  })

  it("reserves the warm-up at 5-10% and the close-out at 5 minutes", () => {
    const warm = p.blocks.find((b) => b.kind === "warmup")!
    expect(warm.minutes / p.practiceMinutes).toBeGreaterThanOrEqual(0.05)
    expect(warm.minutes / p.practiceMinutes).toBeLessThanOrEqual(0.1)
    expect(p.blocks.find((b) => b.kind === "closeout")!.minutes).toBe(5)
    expect(p.loggingMinutes).toBe(5)
  })

  it("keeps clock times back to back", () => {
    p.blocks.forEach((b, i) => {
      if (i > 0) expect(b.startsAt).toEqual(new Date(p.blocks[i - 1].startsAt.getTime() + p.blocks[i - 1].minutes * 60_000))
    })
    expect(p.blocks[0].startsAt).toEqual(wed(10))
  })
})

describe("what the library offers", () => {
  it("never uses a drill that is not active", () => {
    const p = plan({ library: library.map((d) => ({ ...d, locations: ["range" as const] })) })
    expect(names(p)).not.toContain("Closed Drill")
    expect(names(p)).not.toContain("Nine Windows")
  })

  it("never puts a home-net-only drill in a range session", () => {
    for (let i = 0; i < 3; i++) expect(names(plan({ week: week.map((w) => ({ ...w, priority: w.priority + i })) }))).not.toContain("Net Only")
  })

  it("only uses drills that exist at the location", () => {
    const p = plan({ locations: ["putting_green"], library: library.map((d) => (d.practice_category === "lag_putting" || d.practice_category === "short_putting" ? { ...d, locations: ["putting_green" as const] } : d)) })
    expect(p.blocks.every((b) => b.category === "lag_putting" || b.category === "short_putting")).toBe(true)
  })

  it("uses drills from any of several locations, with putting at least a quarter", () => {
    const split = library.map((d) => ({ ...d, locations: [d.practice_category === "lag_putting" || d.practice_category === "short_putting" || d.practice_category === "warmup" || d.practice_category === "closeout" ? ("putting_green" as const) : ("range" as const)] }))
    const p = plan({ locations: ["putting_green", "range"], library: split })
    const cats = new Set(p.blocks.map((b) => b.category))
    expect(cats.has("lag_putting") || cats.has("short_putting")).toBe(true)
    expect(cats.has("approach") || cats.has("wedges") || cats.has("tee")).toBe(true)
    const putting = p.blocks.filter((b) => ["lag_putting", "short_putting", "warmup", "closeout"].includes(b.category)).reduce((n, b) => n + b.minutes, 0)
    expect(putting / p.practiceMinutes).toBeGreaterThanOrEqual(0.25)
    expect(plan({ locations: ["home_net"], library: split }).blocks).toEqual([])
  })

  it("fills from unchecked week items first", () => {
    const done = week.map((w) => (w.area === "approach" ? { ...w, done: w.required } : w))
    expect(plan({ week: done, library: library.map((d) => ({ ...d, locations: ["range" as const] })) }).blocks.some((b) => b.category === "approach")).toBe(false)
  })

  it("carries each drill's level, cue and score direction", () => {
    const levels = Object.fromEntries(library.map((d) => [d.id, 1]))
    const p = plan({ levels, library: library.map((d) => ({ ...d, locations: ["range" as const] })) })
    const b = p.blocks.find((x) => x.kind === "drill")!
    expect(b.level).toEqual({ index: 1, name: "L1", rule: "hard" })
    expect(b.cue).toBe("Roll it to the target.")
    expect(b.lowerIsBetter).toBe(false)
    expect(b.balls).toBe(10)
  })
})
