import { describe, it, expect } from "vitest"
import { buildWeek, ITEM_MINUTES } from "./week"
import type { PracticeArea } from "./weakness"

const pri = (o: Partial<Record<PracticeArea, number>>): Record<PracticeArea, number> => ({
  lag_putting: 0, short_putting: 0, short_game: 0, wedges: 0, approach: 0, tee: 0, ...o,
})
const count = (w: ReturnType<typeof buildWeek>, a: PracticeArea) => w.items.find((i) => i.area === a)?.required ?? 0

describe("buildWeek", () => {
  it("gives lag and short putting at least 2 and the top area at least 3", () => {
    const w = buildWeek(pri({ approach: 2, wedges: 1, short_game: 0.5 }))
    expect(count(w, "lag_putting")).toBeGreaterThanOrEqual(2)
    expect(count(w, "short_putting")).toBeGreaterThanOrEqual(2)
    expect(count(w, "approach")).toBeGreaterThanOrEqual(3)
  })

  it("a top putting area satisfies both rules with 3", () => {
    expect(count(buildWeek(pri({ lag_putting: 2 })), "lag_putting")).toBe(3)
  })

  it("leaves areas with no priority off the checklist", () => {
    expect(count(buildWeek(pri({ approach: 1 })), "tee")).toBe(0)
  })

  it("keeps total minutes within the default 600 + 540 budget", () => {
    const w = buildWeek(pri({ lag_putting: 1, short_putting: 1, short_game: 1, wedges: 1, approach: 1, tee: 1 }))
    expect(w.minutes).toBeLessThanOrEqual(1140)
    expect(w.minutes).toBe(w.items.reduce((n, i) => n + i.required * ITEM_MINUTES[i.area], 0))
  })

  it("drops the lowest priorities first and lists them", () => {
    const p = pri({ approach: 6, lag_putting: 5, wedges: 4, short_putting: 3, short_game: 2, tee: 1 })
    const w = buildWeek(p, { weekdayMinutes: 120, weekendMinutes: 120 })
    expect(w.minutes).toBeLessThanOrEqual(240)
    expect(w.dropped.length).toBeGreaterThan(0)
    expect(w.dropped[0].area).toBe("tee")
    expect(count(w, "approach")).toBeGreaterThan(0)
  })

  it("reports one off day by default and starts every item undone", () => {
    const w = buildWeek(pri({ approach: 1 }))
    expect(w.offDays).toBe(1)
    expect(w.items.every((i) => i.done === 0)).toBe(true)
  })
})
