import { describe, it, expect } from "vitest"
import { localISODate } from "@/lib/dates"

describe("localISODate", () => {
  it("returns the local date at 21:00 New York, when UTC is already tomorrow", () => {
    process.env.TZ = "America/New_York"
    const d = new Date(2026, 9, 12, 21, 0)
    expect(d.toISOString().slice(0, 10)).toBe("2026-10-13")
    expect(localISODate(d)).toBe("2026-10-12")
  })

  it("zero-pads month and day", () => {
    expect(localISODate(new Date(2026, 0, 5, 12))).toBe("2026-01-05")
  })
})
