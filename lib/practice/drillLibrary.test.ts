import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { LibraryDrill } from "@/lib/supabase/types"
import { buildSession, type SessionBlock } from "./session"
import { LOCATION_CHOICES, locationsWithDrills } from "./startSession"
import { PRACTICE_AREAS } from "./weakness"

const seedOf = (file: string) => JSON.parse(readFileSync(join(__dirname, "../../supabase/migrations", file), "utf8").match(/\$seed\$([\s\S]*?)\$seed\$/)![1]) as Omit<LibraryDrill, "id">[]
const v2 = seedOf("20261024000000_drill_library_v2.sql")
const added = seedOf("20261027000000_drill_library_v3.sql")
const v4 = seedOf("20261105000000_drill_library_v4.sql")
// `on conflict (name) do nothing`: the first drill with a name is the one in the database.
const library: LibraryDrill[] = [...v2, ...added, ...v4].filter((d, i, all) => all.findIndex((x) => x.name === d.name) === i).map((d) => ({ ...d, id: d.name }))
const active = library.filter((d) => d.status === "active")

describe("the seeded drill library", () => {
  it("has at least 5 active drills in every practice category, 4 for the one-per-session close-out", () => {
    for (const category of [...PRACTICE_AREAS, "warmup", "closeout"]) expect(active.filter((d) => d.practice_category === category).length, category).toBeGreaterThanOrEqual(category === "closeout" ? 4 : 5)
  })

  it("has a drill for every location on the Start sheet", () => {
    const stocked = locationsWithDrills(active)
    for (const l of LOCATION_CHOICES) expect(stocked.has(l.value), l.value).toBe(true)
  })

  it("has unique names, and the full drill shape on every drill added", () => {
    for (const seed of [v2, added, v4]) expect(new Set(seed.map((d) => d.name)).size).toBe(seed.length)
    for (const d of added) {
      expect(d.status, d.name).toBe("active")
      expect(d.sets.length, d.name).toBeGreaterThan(0)
      expect(d.levels.length, d.name).toBeGreaterThanOrEqual(3)
      expect(d.metric, d.name).toBeTruthy()
      expect(d.cue, d.name).toBeTruthy()
      expect(d.routine_rule, d.name).toBeTruthy()
      expect(d.source_url, d.name).toBeTruthy()
    }
  })

  it("builds a session from the course alone", () => {
    const plan = buildSession({ week: [], now: new Date(2026, 9, 21, 10), minutes: 90, locations: ["course"], energy: "ok", nextRound: null, history: [], library: active, levels: {} })
    expect(plan.blocks.length).toBeGreaterThan(0)
  })

  it("gives a picked focus most of the drill minutes and counts warm-up and close-out toward the putting floor", () => {
    const plan = buildSession({ week: [], now: new Date(2026, 9, 21, 10), minutes: 60, locations: ["range", "putting_green"], focus: ["wedges"], energy: "ok", nextRound: null, history: [], library: active, levels: {} })
    const sum = (blocks: SessionBlock[]) => blocks.reduce((n, b) => n + b.minutes, 0)
    const drills = plan.blocks.filter((b) => b.kind === "drill")
    const wedges = drills.filter((b) => b.category === "wedges")
    expect(sum(wedges) / sum(drills)).toBeGreaterThanOrEqual(0.6)
    const putting = plan.blocks.filter((b) => active.find((d) => d.id === b.drillId)?.category === "putting")
    expect(sum(putting) / plan.practiceMinutes).toBeGreaterThanOrEqual(0.25)
    expect(sum(putting) / plan.practiceMinutes).toBeLessThan(0.4)
  })

  describe("v4", () => {
    const METRICS = ["count_of_n", "streak", "strokes", "pct"]
    const SWING_WORDS = /(grip|takeaway|backswing|downswing|wrist|hip|shoulder|weight shift)/i

    it("has 32 drills, each with three levels, a source, a metric and sets that add up", () => {
      expect(v4).toHaveLength(32)
      for (const d of v4) {
        expect(d.levels, d.name).toHaveLength(3)
        expect(d.source_url, d.name).toMatch(/^https/)
        expect(METRICS, d.name).toContain(d.metric)
        expect(d.sets.reduce((n, x) => n + x.balls, 0), d.name).toBeGreaterThan(0)
        expect(d.reps_suggested, d.name).toBe(d.sets.reduce((n, x) => n + x.balls, 0))
        for (const l of d.levels) expect(l.name && l.rule, d.name).toBeTruthy()
      }
    })

    it("scores the large totals out of what the sets add up to", () => {
      const total = (name: string) => v4.find((d) => d.name === name)!.sets.reduce((n, x) => n + x.balls, 0)
      expect(total("Range Round")).toBe(32)
      expect(total("Scott Bag Ladder")).toBe(50)
      expect(total("Spieth 10-ft Game")).toBe(80)
      expect(total("Donald 30-Ball Ladder")).toBe(30)
    })

    it("keeps swing mechanics out of every drill's text", () => {
      for (const d of v4) expect([d.name, d.description, d.instructions, d.cue, ...d.sets.map((x) => x.setup), ...d.levels.map((l) => l.rule)].join(" "), d.name).not.toMatch(SWING_WORDS)
    })
  })
})
