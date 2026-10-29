import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { newActiveSession, type ActiveSession } from "@/lib/practice/activeSession"
import type { SessionPlan } from "@/lib/practice/session"

const mocks = vi.hoisted(() => ({ session: null as ActiveSession | null }))
vi.mock("next/navigation", () => ({ usePathname: () => "/you/practice", useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/useIsCompact", () => ({ useIsCompact: () => true }))
vi.mock("@/hooks/useRoundMode", () => ({ useRoundMode: () => ({ on: false, round: null, session: mocks.session }) }))

import { ResumeBar } from "./ResumeBar"

const plan = {
  blocks: [{ drillId: "d", name: "Drill", kind: "drill", category: "lag_putting", startsAt: new Date(), minutes: 10, balls: 5, sets: [{ label: "s", setup: "x", balls: 5 }], routineRule: null, cue: "c", metric: "count_of_n", lowerIsBetter: false, level: null }],
} as unknown as SessionPlan
const session = newActiveSession({ id: "s1", userId: "u", date: "2026-10-21", location: "range", now: 0, plan })

describe("ResumeBar with a practice session", () => {
  it("says Practice in progress while it is running", () => {
    mocks.session = session
    expect(renderToStaticMarkup(<ResumeBar />)).toContain("Practice in progress")
  })

  it("says Unsaved practice once it has ended", () => {
    mocks.session = { ...session, status: "ended_early" }
    const html = renderToStaticMarkup(<ResumeBar />)
    expect(html).toContain("Unsaved practice · Save or discard")
    expect(html).not.toContain("Resume")
  })
})
