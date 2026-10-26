// The runner as the layout composes it, rendered to HTML (no browser needed): the set screen, the summary, and the
// chrome that gives way to them on a phone. The hook is replaced by one reading the real pause flag, so setRoundPaused
// is the same call the Pause button makes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ACTIVE_SESSION_KEY, loadActiveSession, newActiveSession, saveActiveSession, SESSION_PATH, type ActiveSession } from "@/lib/practice/activeSession"
import { discardSession } from "@/lib/practice/discard"
import { recordEntry, skipSet } from "@/lib/practice/runner"
import { inSessionMode } from "@/lib/practice/sessionMode"
import type { SessionBlock, SessionPlan } from "@/lib/practice/session"
import { isRoundPaused, setRoundPaused } from "@/lib/rounds/roundMode"

const mocks = vi.hoisted(() => ({ session: null as ActiveSession | null, compact: true, path: "/you" }))
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path, useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/useIsCompact", () => ({ useIsCompact: () => mocks.compact }))
vi.mock("@/hooks/useRoundMode", () => ({
  useRoundMode: () => ({ round: null, session: mocks.session, on: inSessionMode(mocks.session, mocks.path, isRoundPaused()) }),
}))

vi.mock("@/components/play/BottomSheet", () => ({
  BottomSheet: ({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      <p>{title}</p>
      {children}
      {footer}
    </div>
  ),
}))
vi.mock("@/lib/offline/outbox", () => ({ dropJob: async () => {} }))

import NavBar from "@/components/NavBar"
import { ResumeBar } from "@/components/play/ResumeBar"
import { RunSummary } from "@/components/practice/RunSummary"
import { EndSessionSheet } from "@/components/practice/EndSessionSheet"
import { RunnerScreen } from "@/components/practice/RunnerScreen"

const block = (o: Partial<SessionBlock>): SessionBlock =>
  ({ category: "lag_putting", kind: "drill", startsAt: new Date(), minutes: 20, balls: 10, routineRule: "Full routine every ball.", cue: "Roll it to the circle.", metric: "count_of_n", lowerIsBetter: true, level: { index: 0, name: "3-ft zone", rule: "r" }, ...o }) as SessionBlock

const ladder = block({
  drillId: "ladder",
  name: "Lag ladder",
  sets: [20, 30, 40, 50].map((ft) => ({ label: `${ft} ft`, setup: `10 putts from ${ft} ft`, balls: 10 })),
})
const fiveBalls = block({ drillId: "five", name: "Five ball", sets: [{ label: "Chip", setup: "5 chips", balls: 5 }] })
const clubWork = block({
  drillId: "cw",
  name: "Club Work",
  kind: "club_work",
  category: "approach",
  lowerIsBetter: false,
  sets: [{ label: "7 Iron", club: "7 Iron", setup: "Window either side", balls: 3 }],
})
const closeout = block({ drillId: "co", name: "Three 4-Footers", kind: "closeout", metric: "strokes", minutes: 5, sets: [{ label: "4 ft", setup: "3 in a row", balls: 3 }] })

const make = (blocks: SessionBlock[], location = "putting_green") =>
  newActiveSession({ id: "s1", userId: "u", date: "2026-10-21", location, now: 0, plan: { blocks } as unknown as SessionPlan })
const noop = () => {}
const screen = (session: ActiveSession, extra: Partial<Parameters<typeof RunnerScreen>[0]> = {}) =>
  renderToStaticMarkup(
    <RunnerScreen session={session} now={60_000} compact onSave={noop} onSkip={noop} onUndo={noop} onEnd={noop} onPause={noop} onJumpToCloseout={noop} {...extra} />
  )

afterEach(() => {
  setRoundPaused(false)
  mocks.session = null
  mocks.compact = true
  mocks.path = "/you"
})

describe("the set screen", () => {
  it("shows progress, the set, the cue in quotes, the routine rule and number buttons 0..N", () => {
    const html = screen(recordEntry(make([ladder]), { value: 2 }, 1000))
    expect(html).toContain("Lag ladder · Set 2 of 4")
    expect(html).toContain('aria-valuenow="1"')
    expect(html).toContain("30 ft · 10 balls")
    expect(html).toContain("10 putts from 30 ft")
    expect(html).toContain("“Roll it to the circle.”")
    expect(html).toContain("Full routine every ball.")
    expect(html).toContain("Out of 10 · 3-ft zone · lower is better")
    for (const n of [0, 5, 10]) expect(html).toContain(`>${n}</button>`)
    expect(html).not.toContain(">11</button>")
  })

  it("6 options render in one row of 6 columns, and a longer list in two even rows", () => {
    expect(screen(make([fiveBalls]))).toContain("repeat(6, minmax(0, 1fr))")
    expect(screen(make([ladder]))).toContain("repeat(6, minmax(0, 1fr))")
  })

  it("a Club Work set shows the club and a left, center, right counter", () => {
    const html = screen(make([clubWork], "range"))
    expect(html).toContain("7 Iron · 3 balls")
    for (const side of ["left", "center", "right"]) expect(html).toContain(side)
    expect(html).toContain("Save 7 Iron")
  })

  it("the close-out has Made and Missed instead of numbers", () => {
    const html = screen(make([closeout]))
    expect(html).toContain("0 of 3")
    expect(html).toContain(">Made</button>")
    expect(html).toContain(">Missed</button>")
  })

  it("offers an undo for 5 seconds after a save, and the menu items", () => {
    const saved = recordEntry(make([ladder]), { value: 2 }, 58_000)
    expect(screen(saved)).toContain("Undo last save")
    expect(screen(saved, { now: 64_000 })).not.toContain("Undo last save")
    expect(screen(saved)).toContain('aria-label="Session menu"')
  })

  it("the timer turns warn color 3+ minutes past the block's plan", () => {
    expect(screen(make([ladder]), { now: 20 * 60_000 })).toContain("text-muted")
    expect(screen(make([ladder]), { now: 23 * 60_000 })).toContain("text-warn")
  })

  it("shows the cutoff line near 8:45 pm", () => {
    const evening = new Date(2026, 9, 21, 20, 40).getTime()
    expect(screen(make([ladder, closeout]), { now: evening })).toContain("5 min to cutoff · jump to close-out")
    expect(screen(make([ladder, closeout]))).not.toContain("to cutoff")
  })
})

describe("the summary", () => {
  const summary = (session: ActiveSession) => renderToStaticMarkup(<RunSummary session={session} compact canSave onNotes={noop} onDone={noop} onDiscard={noop} />)
  const done = (blocks: SessionBlock[], location?: string) => {
    let s = make(blocks, location)
    while (s.status === "running") s = recordEntry(s, { value: 1 }, 1000)
    return s
  }

  it("lists each drill against last time", () => {
    const s = { ...done([ladder]), previous: { ladder: 9 } }
    expect(summary(s)).toContain("4 of 40")
    expect(summary(s)).toContain("last time 9")
  })

  it("offers the Launch Pro import after Club Work at the home net or simulator, not on the range", () => {
    expect(summary(done([clubWork], "home_net"))).toContain("Import Launch Pro session")
    expect(summary(done([clubWork], "simulator"))).toContain("Import Launch Pro session")
    expect(summary(done([clubWork], "range"))).not.toContain("Import Launch Pro session")
    expect(summary(done([ladder], "home_net"))).not.toContain("Import Launch Pro session")
  })
})

describe("ending a session", () => {
  it("the confirm sheet says how many sets are scored and offers End and Keep going", () => {
    const html = renderToStaticMarkup(<EndSessionSheet scored={3} total={8} onEnd={noop} onKeepGoing={noop} />)
    expect(html).toContain("End now? 3 of 8 sets scored")
    expect(html).toContain(">End</button>")
    expect(html).toContain(">Keep going</button>")
  })

  it("with nothing scored the summary offers Discard first and Save anyway, not Done", () => {
    let s = make([ladder])
    while (s.status === "running") s = skipSet(s, 1000)
    const html = renderToStaticMarkup(<RunSummary session={s} compact canSave onNotes={noop} onDone={noop} onDiscard={noop} />)
    expect(html).toContain(">Discard</button>")
    expect(html).toContain(">Save anyway</button>")
    expect(html).not.toContain(">Done</button>")
  })

  it("a signed-out golfer with nothing scored can only discard", () => {
    let s = make([ladder])
    while (s.status === "running") s = skipSet(s, 1000)
    const html = renderToStaticMarkup(<RunSummary session={s} compact canSave={false} onNotes={noop} onDone={noop} onDiscard={noop} />)
    expect(html).toContain(">Discard</button>")
    expect(html).not.toContain("Save anyway")
    expect(html).not.toContain("Sign in to save")
  })

  describe("Discard", () => {
    const store = new Map<string, string>()
    beforeEach(() => {
      store.clear()
      ;(globalThis as { window?: unknown }).window = {
        localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
        dispatchEvent: () => true,
      }
    })
    afterEach(() => {
      delete (globalThis as { window?: unknown }).window
    })

    it("clears the stored session and goes back to Practice", async () => {
      const s = skipSet(make([ladder]), 1000)
      saveActiveSession(s)
      expect(store.has(ACTIVE_SESSION_KEY)).toBe(true)
      const went: string[] = []
      await discardSession(s.id, (path) => went.push(path))
      expect(store.has(ACTIVE_SESSION_KEY)).toBe(false)
      expect(loadActiveSession()).toBeNull()
      expect(went).toEqual(["/you/practice"])
    })
  })
})

describe("saving a session", () => {
  it("asks a signed-out golfer to sign in instead of finishing", () => {
    let s = make([ladder])
    while (s.status === "running") s = recordEntry(s, { value: 1 }, 1000)
    const html = renderToStaticMarkup(<RunSummary session={s} compact canSave={false} onNotes={noop} onDone={noop} onDiscard={noop} />)
    expect(html).toContain("Sign in to save")
    expect(html).toContain("/login?redirect=%2Fyou%2Fpractice%2Frun")
    expect(html).not.toContain(">Done</button>")
  })
})

describe("on a phone", () => {
  const phone = () =>
    renderToStaticMarkup(
      <>
        <NavBar />
        <ResumeBar />
      </>
    )

  it("hides the tab bar, header and resume bar while a session runs", () => {
    mocks.session = make([ladder])
    mocks.path = SESSION_PATH
    const html = phone()
    expect(html).not.toContain('aria-label="Main"')
    expect(html).not.toContain("data-round-chrome")
    expect(html).not.toContain("Practice in progress")
  })

  it("Pause brings the tab bar back with a resume bar, Resume goes back", () => {
    mocks.session = recordEntry(make([ladder, closeout]), { value: 1 }, 1000)
    mocks.path = SESSION_PATH
    setRoundPaused(true) // what Pause does
    const paused = phone()
    expect(paused).toContain('aria-label="Main"')
    expect(paused).toContain("Practice in progress · Set 2 of 5")
    expect(paused).toContain("Resume")
    setRoundPaused(false) // what the resume bar does
    expect(phone()).not.toContain('aria-label="Main"')
  })

  it("shows no resume bar on a big screen or with no session", () => {
    mocks.session = make([ladder])
    mocks.compact = false
    expect(phone()).not.toContain("Practice in progress")
    mocks.compact = true
    mocks.session = null
    expect(phone()).not.toContain("Practice in progress")
  })
})
