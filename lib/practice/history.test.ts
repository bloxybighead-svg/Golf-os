import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { newActiveSession, type ActiveSession } from "./activeSession"
import { FREE_PRACTICE, historyRows } from "./history"
import { loggedRunPayload } from "./logged"
import { itemsDone, mondayOf } from "./progress"
import { recordEntry, toRunPayload } from "./runner"
import { runFromPayload, type DrillRef, type FinishedRun } from "./runs"
import type { SessionPlan } from "./session"
import type { LibraryDrill } from "@/lib/supabase/types"

const lag: DrillRef & Pick<LibraryDrill, "category" | "locations"> = {
  id: "lag",
  name: "Lag ladder",
  category: "putting",
  locations: ["putting_green"],
  metric: "count_of_n",
  lower_is_better: false,
  practice_category: "lag_putting",
  levels: [],
  sets: [],
}
const library = [lag]

const NOW = new Date(2026, 9, 21, 18, 30)
const logged = (drill: typeof lag | null, score: number | null): FinishedRun =>
  runFromPayload(loggedRunPayload({ id: "log1", userId: "u", drill, minutes: 20, score, now: NOW })) as FinishedRun

describe("a hand-logged drill", () => {
  it("shows in Drill history with its score, and as 'logged' without one", () => {
    expect(historyRows([logged(lag, 7)], library)).toMatchObject([{ name: "Lag ladder", category: "putting", score: 7, session: false }])
    expect(historyRows([logged(lag, null)], library)[0].score).toBeNull()
  })

  it("counts toward the week like a runner session", () => {
    expect(itemsDone([logged(lag, null)], library, mondayOf(NOW))).toEqual({ lag_putting: 1 })
  })

  it("is a completed run that started `minutes` before it ended", () => {
    const p = loggedRunPayload({ id: "x", userId: "u", drill: lag, minutes: 20, score: 7, now: NOW })
    expect(p.run).toMatchObject({ status: "completed", location: "putting_green", source: "logged", endedAt: NOW.toISOString() })
    expect(NOW.getTime() - new Date(p.run.startedAt).getTime()).toBe(20 * 60_000)
    expect(p.sets).toHaveLength(1)
    expect(p.sets[0]).toMatchObject({ drillId: "lag", skipped: false, value: 7 })
  })

  it("free practice is a run with no sets, shown as such", () => {
    const run = logged(null, null)
    expect(run.sets).toHaveLength(0)
    expect(historyRows([run], library)).toMatchObject([{ name: FREE_PRACTICE, category: null, session: false }])
  })
})

describe("a finished runner session", () => {
  const plan: SessionPlan = {
    off: false,
    practiceMinutes: 20,
    loggingMinutes: 0,
    endsAt: null,
    notes: [],
    blocks: [
      {
        drillId: "lag",
        name: "Lag ladder",
        kind: "drill",
        category: "lag_putting",
        startsAt: NOW,
        minutes: 20,
        balls: 10,
        sets: [{ label: "20 ft", setup: "", balls: 10 }],
        routineRule: "",
        cue: "",
        metric: "count_of_n",
        lowerIsBetter: false,
        level: null,
      },
    ],
  }
  const session: ActiveSession = recordEntry(
    newActiveSession({ id: "run1", userId: "u", date: "2026-10-21", location: "putting_green", now: NOW.getTime(), plan }),
    { value: 6 },
    NOW.getTime() + 1000
  )

  it("shows in Drill history tagged as a session", () => {
    const run = runFromPayload(toRunPayload({ ...session, status: "completed" }, { at: NOW.getTime() + 60_000 })) as FinishedRun
    expect(historyRows([run], library)).toMatchObject([{ name: "Lag ladder", score: 6, session: true }])
  })

  it("lists newest first, one row per drill per run", () => {
    const older = { ...logged(lag, 3), id: "older", startedAt: new Date(2026, 9, 1).toISOString() }
    const rows = historyRows([older, logged(lag, 7)], library)
    expect(rows.map((r) => r.score)).toEqual([7, 3])
  })
})

describe("practice history has one source", () => {
  it("no file in app, lib, components or hooks reads the retired tables", () => {
    const retired = [["user", "drills"].join("_"), ["practice", "sessions"].join("_")]
    const root = join(__dirname, "../..")
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(name) && retired.some((t) => readFileSync(path, "utf8").includes(t))) hits.push(path)
      }
    }
    for (const dir of ["app", "lib", "components", "hooks"]) walk(join(root, dir))
    expect(hits).toEqual([])
  })
})
