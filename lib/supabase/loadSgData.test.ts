import { describe, expect, it, vi } from "vitest"
import { fakeClient } from "./fakeClient"
import { loadSgData } from "./loadSgData"

vi.mock("@/lib/courses/fetchScorecard", () => ({ fetchScorecard: async () => null }))

describe("loadSgData", () => {
  it("asks for round_holes once", async () => {
    const db = fakeClient({ rounds: [{ id: "r1", date: "2026-10-01", course_name: "A", holes_played: 18, course_id: null, tee_name: null }] })
    await loadSgData(db.client as never)
    expect(db.count("round_holes")).toBe(1)
  })
})
