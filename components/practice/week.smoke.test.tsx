import { Children, isValidElement, type ReactElement, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { PracticeWeek } from "@/hooks/usePracticeWeek"
import { DrillTrends } from "@/components/you/DrillTrends"
import { LogPracticeSheet } from "@/components/you/LogPracticeSheet"
import { initialFocus } from "@/lib/practice/startSession"
import { WeekCardView } from "./WeekCard"

vi.mock("@/hooks/useActiveSession", () => ({ useActiveSession: () => ({ session: null }) }))
vi.mock("@/hooks/usePracticeWeek", () => ({ usePracticeWeek: () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))

/** Every element in a rendered tree, calling function components so their markup is searchable. */
function flatten(node: ReactNode): ReactElement[] {
  if (!isValidElement(node)) return []
  const el = node as ReactElement<{ children?: ReactNode }>
  const inner = typeof el.type === "function" ? (el.type as (p: unknown) => ReactNode)(el.props) : el.props.children
  return [el, ...Children.toArray(inner).flatMap(flatten)]
}

const week = (o: Partial<PracticeWeek> = {}): PracticeWeek => ({
  typical: false,
  runs: [],
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
    expect(html).toContain("1 of 3 blocks")
    expect(html).toContain("Done")
    expect(html).toContain("About 125 min across the week")
    expect(html).toContain("left out to fit the week: Tee 1")
    expect(html).toContain("Wedges moved up: 0.9 strokes/round lost vs scratch.")
    expect(html).not.toContain("Last week")
  })

  it("makes unfinished rows buttons that pick their area, and leaves Done rows alone", () => {
    const picked: string[] = []
    const buttons = flatten(<WeekCardView week={week()} onPick={(a) => picked.push(a)} />).filter((e) => e.type === "button")
    expect(buttons).toHaveLength(1)
    ;(buttons[0].props as { onClick: () => void }).onClick()
    expect(picked).toEqual(["lag_putting"])
    expect(renderToStaticMarkup(<WeekCardView week={week()} onPick={() => {}} />)).toContain("Done")
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

  it("says when the week follows typical golfers", () => {
    expect(renderToStaticMarkup(<WeekCardView week={week({ typical: true })} />)).toContain("Based on typical golfers until you log 3 rounds")
    expect(renderToStaticMarkup(<WeekCardView week={week()} />)).not.toContain("typical golfers")
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

describe("Start sheet focus", () => {
  const now = new Date(2026, 9, 26, 10)
  it("a tapped Wedges row sets Focus to Wedges over a saved pick", () => {
    expect(initialFocus("wedges", { savedOn: "2026-10-26", focus: ["tee"] }, now)).toEqual(["wedges"])
  })
  it("without a tap, keeps today's pick and otherwise goes back to Auto", () => {
    expect(initialFocus(null, { savedOn: "2026-10-26", focus: ["tee"] }, now)).toEqual(["tee"])
    expect(initialFocus(null, { savedOn: "2026-10-25", focus: ["tee"] }, now)).toEqual([])
  })
})

describe("the Practice page buttons", () => {
  it("has one filled accent button: Start session", async () => {
    const { PracticePlan } = await import("./PracticePlan")
    const html = renderToStaticMarkup(
      <>
        <PracticePlan sgData={[]} fits={null} handicapIndex={null} savedRuns={[]} library={[]} activeLibrary={[]} levels={{}} levelSince={{}} userId={null} />
        <LogPracticeSheet library={[]} userId={null} />
      </>
    )
    expect(html.match(/bg-accent/g)).toHaveLength(1)
    expect(html).toContain(">Start session<")
    expect(html).toContain(">Log practice you did without the app<")
  })
})
