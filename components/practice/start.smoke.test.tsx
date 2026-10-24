import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ActiveSession } from "@/lib/practice/activeSession"
import { cutoffCapMinutes } from "@/lib/practice/session"
import { DEFAULT_ANSWERS } from "@/lib/practice/startSession"

const mocks = vi.hoisted(() => ({ session: null as ActiveSession | null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/useActiveSession", () => ({ useActiveSession: () => ({ session: mocks.session, update: () => {}, finish: async () => true }) }))

import { SessionAnswers } from "./SessionAnswers"
import { SessionCard } from "./SessionCard"
import { StartSession } from "./StartSession"

afterEach(() => {
  mocks.session = null
})

const answers = (cap: number, o: Partial<Parameters<typeof SessionAnswers>[0]> = {}) =>
  renderToStaticMarkup(<SessionAnswers answers={DEFAULT_ANSWERS} cap={cap} nextRound={null} today={new Date(2026, 9, 21, 10)} onAnswers={() => {}} onNextRound={() => {}} {...o} />)

describe("the answers", () => {
  it("asks three questions and keeps the next round collapsed", () => {
    const html = answers(640)
    for (const q of ["Minutes", "Locations", "How you feel"]) expect(html).toContain(q)
    for (const c of ["30", "60", "90", "120", "Other", "Home net", "Short-game area", "Putting green", "Range", "Course", "Simulator", "Good", "Sore"]) expect(html).toContain(`>${c}</button>`)
    expect(html).toContain("Next round: not set")
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain("Next round date")
    expect(html).not.toContain("until 8:45")
  })

  it("at 7:30 pm shows the cutoff cap and disables what is above it", () => {
    const cap = cutoffCapMinutes(new Date(2026, 9, 21, 19, 30))
    expect(cap).toBe(70)
    const html = answers(cap)
    expect(html).toContain("Until 8:45 pm: 70 min max")
    expect(html.match(/disabled=""/g)).toHaveLength(2) // 90 and 120
    expect(html).toMatch(/aria-pressed="true"[^>]*>60</)
  })

  it("lets more than one location be picked", () => {
    const html = answers(640, { answers: { ...DEFAULT_ANSWERS, locations: ["putting_green", "range"] } })
    const pressed = (label: string) => new RegExp(`aria-pressed="true"[^>]*>${label}<`).test(html)
    expect(pressed("Putting green")).toBe(true)
    expect(pressed("Range")).toBe(true)
    expect(pressed("Home net")).toBe(false)
  })

  it("shows a remembered next round", () => {
    expect(answers(640, { nextRound: { date: "2026-10-24", competitive: true, courseKnown: true } })).toContain("Next round: Sat, competitive, known course")
  })
})

describe("the session card", () => {
  const plan = { off: false, blocks: [{ name: "Pelz Lag Ladder", minutes: 25, drillId: "d1" }, { name: "Three 4-Footers", minutes: 5, drillId: "d2" }], practiceMinutes: 30, loggingMinutes: 5, endsAt: new Date(2026, 9, 21, 20, 5), notes: ["Capped to 30 min so logging ends by 8:45 pm."] } as unknown as Parameters<typeof SessionCard>[0]["plan"]
  const library = [{ id: "d1", equipment: "putter, balls, tees" }, { id: "d2", equipment: "putter, balls" }] as unknown as Parameters<typeof SessionCard>[0]["library"]

  it("shows total time, end time, blocks, what to bring and the engine's notes", () => {
    const html = renderToStaticMarkup(<SessionCard plan={plan} locations={["putting_green", "range"]} library={library} />)
    expect(html).toContain("35 min · ends 8:05 PM")
    expect(html).toContain("Putting green, Range")
    expect(html).toContain("Pelz Lag Ladder")
    expect(html).toContain("25 min")
    expect(html).toContain("putter, balls, tees")
    expect(html).toContain("Capped to 30 min")
  })

  it("an off day shows only its note", () => {
    const off = { off: true, blocks: [], practiceMinutes: 0, loggingMinutes: 0, endsAt: null, notes: ["6 practice days in a row: today is an off day."] } as unknown as typeof plan
    const html = renderToStaticMarkup(<SessionCard plan={off} locations={["range"]} library={[]} />)
    expect(html).toContain("off day")
    expect(html).not.toContain("min ·")
  })
})

describe("the Start session button", () => {
  const props = { week: { view: { week: { items: [] } }, runs: [] } as never, library: [], activeLibrary: [], levels: {}, levelSince: {}, userId: null }

  it("starts a session when none is running", () => {
    const html = renderToStaticMarkup(<StartSession {...props} />)
    expect(html).toContain(">Start session<")
    expect(html).not.toContain("Resume session")
  })

  it("turns into Resume session while one is running", () => {
    mocks.session = { id: "s1" } as ActiveSession
    const html = renderToStaticMarkup(<StartSession {...props} />)
    expect(html).toContain(">Resume session<")
    expect(html).not.toContain(">Start session<")
  })
})
