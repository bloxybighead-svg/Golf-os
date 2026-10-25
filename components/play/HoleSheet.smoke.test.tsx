import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { landingPoint } from "@/lib/course/geo"
import { HoleSheet } from "@/components/play/RoundSheets"
import type { ActiveRound } from "@/lib/rounds/activeRound"
import { greenFromScore, type HoleEntry } from "@/lib/rounds/holes"
import { recordShot } from "@/lib/rounds/shots"

vi.mock("@/components/play/BottomSheet", () => ({
  BottomSheet: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}))

const tee = { lat: 40, lng: -74 }
const at = (yd: number) => landingPoint(tee, 0, yd, 0)
const hole = (over: Partial<HoleEntry> = {}): HoleEntry => ({
  hole_number: 1, par: 4, strokes: 4, fairway_hit: null, fairway_miss_side: null, green_hit: null, green_miss_side: null, putts: 2, penalty: false, penalty_shot: null, ...over,
})
const swings = () =>
  recordShot(recordShot([], { holeNumber: 1, club: "Driver", clubConfirmed: false, at: tee, atLie: "tee", pin: at(400) }), {
    holeNumber: 1, club: "7-Iron", clubConfirmed: false, at: at(250), atLie: "fairway", pin: at(400),
  })
const round = (over: Partial<ActiveRound> = {}): ActiveRound => ({
  id: "r", course: { id: "c", name: "Colts Neck", city: null, state: null, par: 72, lat: 0, lng: 0 }, date: "2026-10-20", teeName: null,
  courseRating: null, slopeRating: null, startHole: 1, holes: [hole()], ...over,
})

const sheet = (r: ActiveRound) =>
  renderToStaticMarkup(
    <HoleSheet round={r} holeNumber={1} advance onRoundChange={() => {}} onSheetChange={() => {}} onGoToHole={() => {}} ball={{ at: at(300), lie: "rough" }} onMissedSwing={() => {}} />
  )

describe("Hole done", () => {
  it("with tracking off adds no first putt row and no question, even with shots on the hole", () => {
    const html = sheet(round({ shots: swings(), holes: [hole({ strokes: 5 })] }))
    expect(html).not.toContain("First putt")
    expect(html).not.toContain("before putting")
    expect(html).not.toContain("Missed a swing")
  })

  it("with tracking on and the shots adding up, shows the optional first putt and asks nothing", () => {
    const html = sheet(round({ trackShots: true, shots: swings() }))
    expect(html).toContain("First putt")
    expect(html).not.toContain("before putting")
  })

  it("score 5 with 2 swings and 2 putts asks exactly one question", () => {
    const html = sheet(round({ trackShots: true, shots: swings(), holes: [hole({ strokes: 5 })] }))
    expect(html.match(/shot before putting/g)).toHaveLength(1)
    expect(html).toContain("1 shot before putting")
    expect(html).toContain("Chip")
    expect(html).toContain("Missed a swing")
  })

  it("more shots than the score offers to delete one", () => {
    const html = sheet(round({ trackShots: true, shots: swings(), holes: [hole({ strokes: 3 })] }))
    expect(html).toContain("More shots than your score")
    expect(html).toContain("Delete")
  })

  it("no first putt row without putts, and 0 putts asks nothing when the swings add up", () => {
    const html = sheet(round({ trackShots: true, shots: swings(), holes: [hole({ strokes: 2, putts: 0 })] }))
    expect(html).not.toContain("First putt")
    expect(html).not.toContain("before putting")
  })

  it("a new hole opens with par and 2 putts picked and Save enabled", () => {
    const html = sheet(round({ holes: [hole({ strokes: null, putts: null })] }))
    expect(html).toMatch(/aria-pressed="true"[^>]*>4<\/button>/)
    expect(html).toMatch(/aria-pressed="true" aria-label="2 putts"/)
    expect(html).toContain("Par</span>")
    expect(html).not.toMatch(/<button[^>]* disabled=/)
  })

  it("4 strokes with 2 putts on a par 4 sets the green without the compass", () => {
    const html = sheet(round())
    expect(html).toContain("Green: hit, from your score")
    expect(html).not.toContain("Green missed")
  })

  it("5 strokes with 2 putts on a par 4 shows four miss buttons and no Hit", () => {
    const html = sheet(round({ holes: [hole({ strokes: 5 })] }))
    expect(html.match(/aria-label="Green missed (long|left|right|short)"/g)).toHaveLength(4)
    expect(html).not.toContain("Green in regulation")
    expect(html).not.toContain("from your score")
  })

  it("a tapped green answer survives changing the score", () => {
    const tapped = hole({ strokes: 5, green_hit: false, green_miss_side: "left" })
    expect(greenFromScore({ ...tapped, strokes: 4 }, true)).toMatchObject({ green_hit: false, green_miss_side: "left" })
    expect(greenFromScore({ ...hole({ green_hit: true }), strokes: 5 }, true).green_hit).toBe(true)
    expect(greenFromScore({ ...hole({ green_hit: true }), strokes: 5 }, false).green_hit).toBeNull()
  })
})
