import { describe, expect, it, vi } from "vitest"
import { fakeClient } from "@/lib/supabase/fakeClient"

const db = vi.hoisted(() => ({ current: null as ReturnType<typeof import("@/lib/supabase/fakeClient").fakeClient> | null }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.current!.client }))
vi.mock("@/lib/supabase/loadSgData", () => ({ loadSgData: async () => [] }))
vi.mock("@/lib/supabase/loadMyProfile", () => ({ loadMyProfile: async () => null }))
vi.mock("@/components/practice/PracticePlan", () => ({ PracticePlan: () => null }))
vi.mock("@/components/you/LogPracticeSheet", () => ({ LogPracticeSheet: () => null }))
vi.mock("@/components/you/DrillHistory", () => ({ DrillHistory: () => null }))

import PracticePage from "./page"

describe("the practice page", () => {
  it("asks for drill_library once", async () => {
    db.current = fakeClient()
    await PracticePage()
    expect(db.current.count("drill_library")).toBe(1)
  })
})
