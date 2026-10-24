import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { PracticeWeek } from "@/hooks/usePracticeWeek"
import { DrillTrends } from "@/components/you/DrillTrends"
import { WeekCardView } from "./WeekCard"

const week = (o: Partial<PracticeWeek> = {}): PracticeWeek => ({
  empty: false,
  lastWeek: null,
  view: {
    week: {
      items: [
        { area: "lag_putting", required: 3, done: 1, priority: 1, minutes: 25 },
        { area: "wedges", required: 2, done: 2, priority: 0.5, minutes: 25 },
      ],
      minutes: 125,
      offDays: 1,
      dropped: [{ area: "tee", count: 1 }],
    },
    last: null,
    topChange: "Wedges moved up: 0.9 strokes/round lost vs scratch.",
    next: { current: { weekStart: "2026-10-26", items: [], topArea: "wedges" }, last: null },
  },
  ...o,
})

describe("WeekCardView", () => {
  it("lists items done of required, the minutes, what was left out and why the top moved", () => {
    const html = renderToStaticMarkup(<WeekCardView week={week()} />)
    expect(html).toContain("Lag putting")
    expect(html).toContain("1 of 3")
    expect(html).toContain("Done")
    expect(html).toContain("125 min planned")
    expect(html).toContain("left out to fit the week: Tee 1")
    expect(html).toContain("Wedges moved up: 0.9 strokes/round lost vs scratch.")
    expect(html).not.toContain("Last week")
  })

  it("adds the Last week row with items, minutes, the best drill and Tiger 5", () => {
    const html = renderToStaticMarkup(
      <WeekCardView week={week({ lastWeek: { done: 7, planned: 9, minutes: 340, best: { name: "Pelz Lag Ladder", from: 9, to: 6 }, tiger5: { week: 2.1, recent: 2.8 } } })} />
    )
    expect(html).toContain("Last week")
    expect(html).toContain("7 of 9 items · 340 min")
    expect(html).toContain("Best: Pelz Lag Ladder 9 → 6")
    expect(html).toContain("Tiger 5: 2.1 a round, against 2.8 over your last 10")
  })

  it("asks for rounds when there is nothing to go on", () => {
    expect(renderToStaticMarkup(<WeekCardView week={week({ empty: true })} />)).toContain("Log 3 rounds to build your week")
  })
})

describe("DrillTrends", () => {
  const trend = (sessions: number, values: number[]) => ({ drillId: "d", name: "Pelz Lag Ladder", values, sessions, lowerIsBetter: true, level: "3-ft zone" })

  it("shows numbers under 5 sessions and a line from 5", () => {
    const few = renderToStaticMarkup(<DrillTrends trends={[trend(3, [9, 7, 6])]} />)
    expect(few).toContain("9 · 7 · 6")
    expect(few).not.toContain("<svg")
    const many = renderToStaticMarkup(<DrillTrends trends={[trend(6, [9, 8, 7, 6, 5])]} />)
    expect(many).toContain("<svg")
    expect(many).toContain("3-ft zone")
  })

  it("renders nothing without a drill scored 3 times", () => {
    expect(renderToStaticMarkup(<DrillTrends trends={[]} />)).toBe("")
  })
})
