import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { LibraryDrill } from "@/lib/supabase/types"
import { buildSession } from "./session"
import { LOCATION_CHOICES, locationsWithDrills } from "./startSession"
import { PRACTICE_AREAS } from "./weakness"

const seedOf = (file: string) => JSON.parse(readFileSync(join(__dirname, "../../supabase/migrations", file), "utf8").match(/\$seed\$([\s\S]*?)\$seed\$/)![1]) as Omit<LibraryDrill, "id">[]
const added = seedOf("20261027000000_drill_library_v3.sql")
const library: LibraryDrill[] = [...seedOf("20261024000000_drill_library_v2.sql"), ...added].map((d) => ({ ...d, id: d.name }))
const active = library.filter((d) => d.status === "active")

describe("the seeded drill library", () => {
  it("has at least 3 active drills in every practice category", () => {
    for (const category of [...PRACTICE_AREAS, "warmup", "closeout"]) expect(active.filter((d) => d.practice_category === category).length, category).toBeGreaterThanOrEqual(3)
  })

  it("has a drill for every location on the Start sheet", () => {
    const stocked = locationsWithDrills(active)
    for (const l of LOCATION_CHOICES) expect(stocked.has(l.value), l.value).toBe(true)
  })

  it("has unique names, and the full drill shape on every drill added", () => {
    expect(new Set(library.map((d) => d.name)).size).toBe(library.length)
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
})
