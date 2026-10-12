// Round mode, rendered the way the layout composes it: the tab bar and the "Round in progress" bar come from the
// layout, the round screen (with its Map | Score bar) from Play. Rendered to HTML (no browser needed); the
// hooks are replaced by ones that read the real round-mode state, so setRoundPaused is the same call "Pause round" makes.

import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { holesFor, type ActiveRound } from "@/lib/rounds/activeRound"
import { inRoundMode, isRoundPaused, setRoundPaused } from "@/lib/rounds/roundMode"

const mocks = vi.hoisted(() => ({ round: null as ActiveRound | null, compact: true }))
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/useIsCompact", () => ({ useIsCompact: () => mocks.compact }))
vi.mock("@/hooks/useRoundMode", () => ({
  useRoundMode: () => ({ round: mocks.round, on: inRoundMode(mocks.round, "/", isRoundPaused()) }),
}))

import NavBar from "@/components/NavBar"
import { ResumeBar } from "@/components/play/ResumeBar"
import { RoundBar } from "@/components/play/RoundBar"
import { RoundDock } from "@/components/play/RoundDock"
import { RoundScreen } from "@/components/play/RoundScreen"
import { HoleHeader } from "@/components/planner/HoleHeader"
import { DOCK_ROW_CLASS } from "@/lib/planner/dock"

const round: ActiveRound = {
  id: "r1",
  course: { id: "c1", name: "Pebble Beach" } as ActiveRound["course"],
  date: "2026-10-11",
  teeName: null,
  courseRating: null,
  slopeRating: null,
  startHole: 7,
  holes: holesFor([7, 8, 9]),
}

/** What the layout and Play put on a phone: the round screen while the round is on screen, the normal chrome when not. */
function phone() {
  const on = inRoundMode(mocks.round, "/", isRoundPaused())
  return renderToStaticMarkup(
    <>
      <NavBar />
      <ResumeBar />
      {on && (
        <RoundScreen
          scoring={false}
          header={
            <HoleHeader
              inRoundScreen
              title="H7 · P4 · 412"
              courseName="Pebble Beach"
              onOpenPicker={() => {}}
              showArrows
              onStep={() => {}}
              holeLabel={() => "Hole 8"}
              menu={[{ label: "Pause round", onSelect: () => {} }]}
            />
          }
          map={<div />}
          dock={<RoundDock plays={<div />} chips={<div />} onDetails={() => {}} />}
          score={null}
          bar={<RoundBar variant="bar" view="map" onViewChange={() => {}} scoreLabel="+2" />}
        />
      )}
    </>
  )
}

afterEach(() => {
  setRoundPaused(false)
  mocks.round = null
  mocks.compact = true
})

describe("round mode on a phone", () => {
  it("shows the round screen and no tab list, header or resume bar", () => {
    mocks.round = round
    const html = phone()
    expect(html).not.toContain('aria-label="Main"') // the tab list
    expect(html).not.toContain("data-round-chrome") // the header and tab bar are gone, not hidden
    expect(html).not.toContain("Round in progress")
    expect(html).toContain('aria-label="Round"') // Map | Score
    expect(html).toContain('aria-label="Map"')
    expect(html).toContain("+2") // Score shows the score to par
    expect(html).toContain('aria-label="Round menu"')
    expect(html).toContain("H7 · P4 · 412")
  })

  it("Pause round brings the tab list back with the resume bar, and Resume goes back", () => {
    mocks.round = round
    setRoundPaused(true) // what the menu's Pause round does
    const paused = phone()
    expect(paused).toContain('aria-label="Main"')
    expect(paused).toContain("Round in progress · H7")
    expect(paused).toContain("Resume")
    expect(paused).not.toContain("data-round-screen")
    setRoundPaused(false) // what the resume bar does
    expect(phone()).not.toContain('aria-label="Main"')
  })

  it("with no round the app looks as it always did", () => {
    const html = phone()
    expect(html).toContain('aria-label="Main"')
    expect(html).not.toContain("Round in progress")
  })

  it("a round on a big screen keeps the tab list and shows no resume bar", () => {
    mocks.round = round
    mocks.compact = false
    setRoundPaused(true)
    const html = phone()
    expect(html).toContain('aria-label="Main"')
    expect(html).not.toContain("Round in progress")
  })
})

describe("round screen pieces", () => {
  it("the dock is exactly two rows", () => {
    const html = renderToStaticMarkup(<RoundDock plays={<div />} chips={<div />} onDetails={null} />)
    expect(html.match(/data-dock-row="/g)).toHaveLength(2)
    expect(html).toContain(DOCK_ROW_CLASS.plays)
    expect(html).toContain(DOCK_ROW_CLASS.chips)
    expect(html).not.toContain("Shot details") // nothing to show yet
  })

  it("the grid rows are the header, the map's remainder, the dock's own height and the bar", () => {
    const html = renderToStaticMarkup(<RoundScreen scoring={false} header={null} map={null} dock={null} score={null} bar={null} />)
    expect(html).toContain("grid-rows-[52px_minmax(0,1fr)_auto_calc(56px+env(safe-area-inset-bottom))]")
    expect(html).toContain("h-[100dvh]")
  })

  it("scoring hides the map and the dock and gives the score pad their rows", () => {
    const html = renderToStaticMarkup(<RoundScreen scoring header={null} map={<i id="m" />} dock={<i id="d" />} score={<i id="s" />} bar={null} />)
    expect(html.match(/class="hidden"/g)).toHaveLength(2) // kept mounted, not removed
    expect(html).toContain("row-span-2")
  })

  it("the hole header has a menu only during a round", () => {
    const props = { title: "H1", onOpenPicker: () => {}, showArrows: false, onStep: () => {}, holeLabel: () => "" }
    expect(renderToStaticMarkup(<HoleHeader {...props} />)).not.toContain("Round menu")
    expect(renderToStaticMarkup(<HoleHeader {...props} menu={[{ label: "Scorecard", onSelect: () => {} }]} />)).toContain("Round menu")
  })
})
