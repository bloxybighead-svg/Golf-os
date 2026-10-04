import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import path from "path"

// A static check of the migration files: every new table is owner-only. The
// behaviour itself (user A cannot read or write user B's rows) is verified on a
// real Postgres by supabase/tests/shot_data_13c_rls.sql, which is run against
// the project after the migration.

const read = (f: string) => readFileSync(path.join(__dirname, "..", "..", "supabase", f), "utf8")
const sql = read("shot_data_13c.sql")
const lockdown = read("shot_data_13c_lockdown.sql")

function policies(text: string, table: string) {
  const re = new RegExp(`create policy "([^"]+)" on public\\.${table}\\s+for (select|insert|update|delete)([\\s\\S]*?);`, "g")
  return Array.from(text.matchAll(re)).map((m) => ({ name: m[1], cmd: m[2], body: m[3] }))
}

describe("shot_data_13c.sql: every table is owner-only", () => {
  for (const table of ["shot_sessions", "shot_profiles", "real_shots"]) {
    it(`${table} has RLS (or is guarded by it) and one owner policy per command`, () => {
      if (table !== "real_shots") expect(sql).toContain(`alter table public.${table} enable row level security`)
      const ps = policies(sql, table)
      expect(ps.map((p) => p.cmd).sort()).toEqual(["delete", "insert", "select", "update"])
      for (const p of ps) {
        expect(p.body, `${p.name} must test auth.uid() = user_id`).toMatch(/auth\.uid\(\) = user_id/)
        expect(p.body, p.name).not.toMatch(/using \(true\)/i)
        expect(p.body, p.name).not.toMatch(/to anon/i)
      }
    })
  }

  it("writes carry a WITH CHECK, and a shot can only join a session its owner owns", () => {
    for (const table of ["shot_sessions", "shot_profiles", "real_shots"]) {
      const writes = policies(sql, table).filter((p) => p.cmd === "insert" || p.cmd === "update")
      for (const p of writes) expect(p.body, p.name).toMatch(/with check/i)
    }
    const shotWrites = policies(sql, "real_shots").filter((p) => p.cmd === "insert" || p.cmd === "update")
    for (const p of shotWrites) expect(p.body, p.name).toMatch(/s\.user_id = auth\.uid\(\)/)
  })

  it("is additive: no drops of tables or columns, no data deletes", () => {
    expect(sql).not.toMatch(/drop table|drop column|truncate|delete from/i)
    expect(sql).not.toMatch(/drop policy if exists "public read/i)
  })

  it("owner is stamped by the database by default and cascades on account delete", () => {
    expect(sql).toMatch(/shot_sessions[\s\S]*user_id uuid not null default auth\.uid\(\) references auth\.users\(id\) on delete cascade/)
    expect(sql).toMatch(/shot_profiles[\s\S]*user_id uuid not null default auth\.uid\(\) references auth\.users\(id\) on delete cascade/)
  })
})

describe("shot_data_13c_lockdown.sql", () => {
  it("removes public read on real_shots and keeps it only for synthetic golfers", () => {
    expect(lockdown).toMatch(/drop policy if exists "public read real_shots"/)
    expect(lockdown).not.toMatch(/create policy "public read real_shots"/)
    expect(lockdown).toMatch(/golfer_profiles[\s\S]*using \(source <> 'calibrated'\)/)
    expect(lockdown).toMatch(/simulated_shots[\s\S]*p\.source <> 'calibrated'/)
  })
})

describe("migration order", () => {
  it("13c's files sort after 13b's and say to run after them", () => {
    expect(sql).toMatch(/AFTER hole_ob_tags\.sql and\s+-- round_holes_penalty_shot\.sql/)
  })
})
