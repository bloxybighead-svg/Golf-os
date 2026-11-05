import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const DIR = join(__dirname, "../supabase/migrations")
const BASELINE = "0001_baseline.sql"

/** The statements of a migration, comments removed. */
const statements = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, "")
    .split(/;[ \t]*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)

describe("migrations are safe to run twice", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql") && f !== BASELINE)

  it("finds the migrations", () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)("%s: no bare create table, insert or create policy", (file) => {
    const sql = readFileSync(join(DIR, file), "utf8")
    const squashed = sql.replace(/\s+/g, " ").toLowerCase()
    for (const s of statements(sql)) {
      expect(s, "create table needs if not exists").not.toMatch(/^create\s+table\s+(?!if\s+not\s+exists)/i)
      if (/^insert\s+into/i.test(s)) expect(s, "insert needs on conflict").toMatch(/\bon\s+conflict\b/i)
      const policy = s.match(/^create\s+policy\s+("[^"]+")\s+on\s+(\S+)/i)
      if (policy) expect(squashed, "create policy needs a drop policy if exists before it").toContain(`drop policy if exists ${policy[1]} on ${policy[2]}`.toLowerCase())
    }
  })
})
