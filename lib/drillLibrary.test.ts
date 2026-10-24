import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import type { LibraryDrill } from "./supabase/types"

type SeedDrill = Omit<LibraryDrill, "id">

const migration = readFileSync(join(__dirname, "../supabase/migrations/20261024000000_drill_library_v2.sql"), "utf8")
const seed: SeedDrill[] = JSON.parse(migration.match(/\$seed\$([\s\S]*?)\$seed\$/)![1])
const active = seed.filter((d) => d.status === "active")

// A cue names a target, ball flight or club, as what to do; never a body part or a "don't".
const BANNED_CUE = /\b(don't|do not|never|wrists?|hips?|shoulders?|arms?|knees?|heads?)\b/i

describe("drill library seed", () => {
  it("has unique names", () => {
    expect(new Set(seed.map((d) => d.name)).size).toBe(seed.length)
  })

  it("locks Nine Windows", () => {
    expect(seed.find((d) => d.name === "Nine Windows")?.status).toBe("locked")
  })

  it.each(active.map((d) => [d.name, d] as const))("%s is a complete active drill", (_name, d) => {
    expect(d.metric).toBeTruthy()
    expect(d.sets.length).toBeGreaterThan(0)
    expect(d.sets.every((s) => s.balls > 0)).toBe(true)
    expect(d.levels.length).toBeGreaterThan(0)
    expect(d.cue).toBeTruthy()
    expect(d.cue).not.toMatch(BANNED_CUE)
    expect(d.source_url).toMatch(/^https:\/\//)
    expect(d.instructions).not.toMatch(/Goal:/)
  })

  it("gives Club Work a club on every set", () => {
    const clubWork = seed.find((d) => d.name === "Club Work")!
    expect(clubWork.sets.every((s) => !!s.club)).toBe(true)
  })
})
