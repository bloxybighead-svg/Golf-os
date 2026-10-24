import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { THEME_INIT_SCRIPT } from "@/lib/theme/themeScript"
import { ROUND_COMPACT_QUERY } from "@/lib/rounds/roundMode"
import { ACTIVE_ROUND_KEY } from "@/lib/rounds/activeRound"
import { ACTIVE_SESSION_KEY, SESSION_PATH, newActiveSession } from "./activeSession"
import { inSessionMode } from "./sessionMode"
import type { SessionPlan } from "./session"

const plan = {
  blocks: [{ drillId: "d", name: "Drill", kind: "drill", category: "lag_putting", startsAt: new Date(), minutes: 10, balls: 5, sets: [{ label: "s", setup: "x", balls: 5 }], routineRule: null, cue: "c", metric: "count_of_n", lowerIsBetter: false, level: null }],
} as unknown as SessionPlan
const session = newActiveSession({ id: "s1", userId: "u", date: "2026-10-21", location: "range", now: 0, plan })

describe("inSessionMode", () => {
  it("is on in the runner with a session going", () => {
    expect(inSessionMode(session, SESSION_PATH, false)).toBe(true)
  })
  it("is off with no session, on another page, or paused", () => {
    expect(inSessionMode(null, SESSION_PATH, false)).toBe(false)
    expect(inSessionMode(session, "/you/practice", false)).toBe(false)
    expect(inSessionMode(session, SESSION_PATH, true)).toBe(false)
  })
})

describe("the inline script that runs before first paint", () => {
  function run(stored: Record<string, string>, pathname: string) {
    const dataset: Record<string, string> = {}
    const localStorage = { getItem: (k: string) => stored[k] ?? null }
    new Function("localStorage", "document", "location", THEME_INIT_SCRIPT)(localStorage, { documentElement: { dataset } }, { pathname })
    return dataset.round
  }
  const mine = JSON.stringify(session)
  const round = JSON.stringify({ course: { id: "c" }, holes: [{}] })

  it("hides the chrome on the runner and leaves a resume bar elsewhere", () => {
    expect(run({ [ACTIVE_SESSION_KEY]: mine }, SESSION_PATH)).toBe("1")
    expect(run({ [ACTIVE_SESSION_KEY]: mine }, "/you")).toBe("resume")
  })
  it("marks nothing without a valid session", () => {
    expect(run({}, SESSION_PATH)).toBeUndefined()
    expect(run({ [ACTIVE_SESSION_KEY]: JSON.stringify({ id: "x", steps: [] }) }, SESSION_PATH)).toBeUndefined()
  })
  it("a session does not undo round mode on Play", () => {
    expect(run({ [ACTIVE_ROUND_KEY]: round, [ACTIVE_SESSION_KEY]: mine }, "/")).toBe("1")
  })
})

describe("globals.css", () => {
  it("hides the chrome under the compact query", () => {
    expect(readFileSync("app/globals.css", "utf8")).toContain(`@media ${ROUND_COMPACT_QUERY}`)
  })
})
