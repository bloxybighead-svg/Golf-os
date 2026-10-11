// Smoke tests for the Play planner's extracted components: they render to HTML
// (react-dom/server, no browser needed) with fixture data and show what the
// page showed before the split.

import type { ComponentProps } from "react"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ClubPlan, OptimizedClubPlan } from "@/lib/course/plan"
import { ClubTable } from "./ClubTable"
import { DetailsPanel } from "./DetailsPanel"
import { HoleHeader } from "./HoleHeader"
import { StrategyToggle } from "./StrategyToggle"
import { ResultCard } from "./ResultCard"
import { ClubChips } from "./ClubChips"
import { PlayDock } from "./PlayDock"
import { DOCK_ROW_CLASS, DOCK_ROW_PX } from "@/lib/planner/dock"

function plan(club: string, expectedStrokes: number, strokesSe: number, carry: number): ClubPlan {
  return {
    club,
    n: 200,
    meanCarryYds: carry,
    meanTotalYds: carry,
    meanRest: { lat: 36.57, lng: -121.95 },
    lieShare: { water: 0, oob: 0, bunker: 0, green: 0, fairway: 0.95, trees: 0, rough: 0.05 },
    unmappedShare: 0,
    expectedStrokes,
    strokesSe,
    strokesGained: 0,
  }
}

const fourIron: OptimizedClubPlan = { club: "4-Iron", bearingDeg: 60, offsetYds: -4, plan: plan("4-Iron", 4.6, 0.02, 190), atAimStrokes: 4.6 }
const threeWood: OptimizedClubPlan = { club: "3-Wood", bearingDeg: 62, offsetYds: 10, plan: plan("3-Wood", 4.61, 0.03, 243), atAimStrokes: 4.7 }
const pw: OptimizedClubPlan = { club: "PW", bearingDeg: 59, offsetYds: 0, plan: plan("PW", 5.06, 0.02, 124), atAimStrokes: 5.1 }

function card(over: Partial<ComponentProps<typeof ResultCard>> = {}) {
  return (
    <ResultCard
      best={fourIron}
      chosen={fourIron}
      clubChoice="auto"
      atBestAim
      aimLie="fairway"
      distPin={364}
      greenYards={{ front: 352, center: 364, back: 376 }}
      options={null}
      onAimAtBest={() => {}}
      onBackToBest={() => {}}
      onOpenDetails={() => {}}
      {...over}
    />
  )
}

function details(over: Partial<ComponentProps<typeof DetailsPanel>> = {}) {
  return (
    <DetailsPanel
      open
      section="scoring"
      onClose={() => {}}
      wind={{ wind: { speedMph: 9, fromDeg: 90 }, source: "auto", at: null, labelTime: false, temperature: { temperatureF: 63, source: "auto" } } as never}
      holeBearingDeg={0}
      playsLikeOn
      onPlaysLikeChange={() => {}}
      hasElevation
      breakdown="+7 uphill, -9 wind, +3 cold"
      coldTip={false}
      hole={null}
      holeQuality={{ fairway: "mapped", greens: "mapped", bunkers: "mapped", water: "missing" }}
      geometry={null}
      onEditHole={() => {}}
      onStartDraw={() => {}}
      onConfirmHazard={() => {}}
      best={fourIron}
      chosen={fourIron}
      chosenLive={plan("4-Iron", 4.6, 0.02, 190)}
      options={null}
      atBestAim
      chosenAtAim={4.6}
      fromLabel="the fairway"
      baselineHandicap={10}
      shotsLabel="Handicap estimate"
      avgLeft={187}
      estimateNotes={{ "4-Iron": "No 4-Iron shots on record: estimated from your 5-Iron" }}
      onCourseSpread={1.2}
      onShowIntro={() => {}}
      {...over}
    />
  )
}

describe("planner components render (smoke)", () => {
  it("ClubTable: aims, carries, ties and the gap to the best club", () => {
    const html = renderToStaticMarkup(
      <ClubTable
        ranking={[fourIron, threeWood, pw]}
        pending={false}
        rankMs={190}
        shownLies={["green", "fairway", "rough"]}
        best={fourIron}
        chosen={fourIron}
        estimateNotes={{ "4-Iron": "No 4-Iron shots on record: estimated from your 5-Iron" }}
        baselineLabel="10.0 handicap"
        onPick={() => {}}
      />
    )
    expect(html).toContain('data-rank-ms="190"')
    expect(html).toContain("4 yd L")
    expect(html).toContain("10 yd R")
    expect(html).toContain("center")
    expect(html).toContain("+0.00")
    expect(html).toContain("~ tie") // 3-Wood is within 1 SE of the 4-Iron
    expect(html).toContain("+0.46")
    expect(html).toContain("est.")
    expect(html).toContain("vs 4-Iron")
  })

  it("HoleHeader: the title line and hole arrows", () => {
    const html = renderToStaticMarkup(
      <HoleHeader title="H1 · P4 · 364" courseName="Pebble Beach" onOpenPicker={() => {}} showArrows onStep={() => {}} holeLabel={(d) => (d === 1 ? "Hole 2" : "Hole 18")} />
    )
    expect(html).toContain("H1 · P4 · 364") // par and yardage never truncate
    expect(html).toMatch(/truncate[^>]*>Pebble Beach/) // the course name is the part that does
    expect(html).toContain("Next hole (Hole 2)")
    expect(html).toContain("Previous hole (Hole 18)")
  })

  it("ResultCard: the club once, where to aim, the distances and nothing else", () => {
    const html = renderToStaticMarkup(card())
    for (const text of ["4-Iron", "Left side of the fairway", "Front", "Center", "Back", "352", "364", "376"]) expect(html).toContain(text)
    expect(html.match(/4-Iron/g)).toHaveLength(1)
    for (const text of ["strokes", "handicap", "Wind", "Fairway", "Greens", "Bunkers", "Water", "Shots", "unmapped", "leaves", "Best play", "Best club"]) {
      expect(html).not.toContain(text)
    }
    expect(html).not.toContain("Use best aim") // already at the best aim
  })

  it("ResultCard: the risk line shows the largest risk only, and not at all at 1% or less", () => {
    const withShare = (lieShare: Partial<OptimizedClubPlan["plan"]["lieShare"]>): OptimizedClubPlan => ({ ...fourIron, plan: { ...fourIron.plan, lieShare: { ...fourIron.plan.lieShare, ...lieShare } } })
    expect(renderToStaticMarkup(card({ chosen: withShare({ oob: 0.01 }) }))).not.toContain("OB")
    const html = renderToStaticMarkup(card({ chosen: withShare({ oob: 0.03, water: 0.08, trees: 0.02 }) }))
    expect(html).toContain("8% water")
    expect(html).toContain("text-warn")
    expect(html).not.toContain("3% OB")
  })

  it("ResultCard: plays shows only when it differs by 2 yd or more; with no green it is one inline row", () => {
    expect(renderToStaticMarkup(card({ pinPlaysLike: { plays: 366 } }))).toContain("plays 366")
    expect(renderToStaticMarkup(card({ pinPlaysLike: { plays: 365 } }))).not.toContain("plays")
    const noGreen = renderToStaticMarkup(card({ greenYards: null, pinPlaysLike: { plays: 370 } })).replace(/<!-- -->/g, "")
    expect(noGreen).toContain("To pin")
    expect(noGreen).toContain("364")
    expect(noGreen).toContain("· plays 370")
    expect(noGreen).not.toContain("Front")
  })

  it("ResultCard: a picked club offers the way back; Smart play or Go for it is named only when they differ", () => {
    const picked = renderToStaticMarkup(card({ chosen: threeWood, clubChoice: "3-Wood", atBestAim: false }))
    expect(picked).toContain("Back to best club")
    expect(picked).toContain("Use best aim")
    const options = { safer: fourIron, lowest: threeWood, same: false } as never
    expect(renderToStaticMarkup(card({ options }))).toContain("Smart play")
    expect(renderToStaticMarkup(card({ options: { safer: fourIron, lowest: fourIron, same: true } as never }))).not.toContain("Smart play")
  })

  it("ResultCard: more than 25% unmapped puts one warning icon beside the club, with no text", () => {
    const withUnmapped = (share: number): OptimizedClubPlan => ({ ...fourIron, plan: { ...fourIron.plan, unmappedShare: share } })
    expect(renderToStaticMarkup(card({ chosen: withUnmapped(0.25) }))).not.toContain("unmapped")
    const html = renderToStaticMarkup(card({ chosen: withUnmapped(0.47) }))
    expect(html).toContain('aria-label="47% unmapped. Show why"')
    expect(html).not.toContain(">47%")
  })

  it("DetailsPanel: Conditions, Map and How it's scored", () => {
    const html = renderToStaticMarkup(details()).replace(/<!-- -->/g, "")
    for (const text of ["Conditions", "Map", "How it’s scored", "+7 uphill, -9 wind, +3 cold", "Plays like on", "Water not mapped", "Mark water"]) expect(html).toContain(text)
    expect(html).toContain('Expected strokes</span> <span class="tabular-nums text-fg-2">4.6<')
    expect(html).toContain("a 10.0 handicap")
    expect(html).toContain("Handicap estimate")
    expect(html).toContain("Every shot is placed on the map") // the existing method text
    expect(html).not.toContain("Carry / finish") // carry and finish are the same here, so one number
    expect(renderToStaticMarkup(details({ open: false }))).toBe("")
  })

  it("DetailsPanel: the difference to the other option is a difference, never two strokes numbers", () => {
    const html = renderToStaticMarkup(details({ chosen: threeWood, chosenLive: plan("3-Wood", 4.61, 0.03, 243), atBestAim: false, chosenAtAim: 4.71 }))
    expect(html).toContain("vs 4-Iron")
    expect(html).toContain("+0.01")
    expect(html).toContain("a tie, within the noise")
    expect(html).toContain("+0.10") // at your aim
  })

  it("StrategyToggle: both plays, one line each: club and its risk", () => {
    const risky: OptimizedClubPlan = { ...pw, plan: { ...pw.plan, lieShare: { ...pw.plan.lieShare, oob: 0.04 } } }
    const html = renderToStaticMarkup(<StrategyToggle options={{ safer: risky, lowest: fourIron, same: false } as never} chosen={fourIron} onPick={() => {}} compact />)
    expect(html).toContain("Smart play")
    expect(html).toContain("Go for it")
    expect(html).toContain("4% OB")
    expect(html).not.toContain("strokes")
  })

  it("StrategyToggle: flags the chosen play when much of it is on unmapped ground", () => {
    const html = renderToStaticMarkup(
      <StrategyToggle options={{ safer: fourIron, lowest: fourIron, same: true } as never} chosen={fourIron} onPick={() => {}} compact unmappedWarning={0.54} onUnmapped={() => {}} />
    )
    expect(html).toContain("Best play")
    expect(html).toContain('aria-label="54% unmapped. Show why"')
    expect(html).not.toContain(">54% unmapped<") // the words live in the icon, not on the card
  })

  it("ClubChips: the best three, a tie marked, then More", () => {
    const tied: OptimizedClubPlan = { ...pw, plan: { ...pw.plan, expectedStrokes: 4.61, strokesSe: 0.03 } }
    const html = renderToStaticMarkup(<ClubChips ranking={[fourIron, tied, threeWood, pw]} chosen={fourIron} onPick={() => {}} onMore={() => {}} />)
    for (const text of ["4-Iron", "PW", "3-Wood", "More"]) expect(html).toContain(text)
    expect(html.match(/≈/g)).toHaveLength(2) // PW and 3-Wood are within the noise of the best
    expect(html).not.toContain("aria-hidden") // no rank numerals
    const ninth: OptimizedClubPlan = { ...pw, club: "9-Iron" }
    const fourth = renderToStaticMarkup(<ClubChips ranking={[fourIron, tied, threeWood, ninth]} chosen={ninth} onPick={() => {}} onMore={() => {}} />)
    expect(fourth).toContain("9-Iron") // a pick from the table takes the third chip
    expect(fourth).not.toContain("3-Wood")
  })

  it("phone dock: three fixed rows, cards of two truncating lines, nothing that can wrap", () => {
    const sevenWood: OptimizedClubPlan = { ...fourIron, club: "7-Wood", plan: { ...plan("7-Wood", 4.6, 0.02, 200), unmappedShare: 0.43 } }
    const html = renderToStaticMarkup(
      <PlayDock
        scoring={false}
        status={<button>Start round</button>}
        plays={<StrategyToggle options={{ safer: sevenWood, lowest: sevenWood, same: false } as never} chosen={sevenWood} onPick={() => {}} compact unmappedWarning={0.43} onUnmapped={() => {}} />}
        chips={<ClubChips ranking={[sevenWood, pw]} chosen={sevenWood} onPick={() => {}} onMore={() => {}} className="flex min-w-0 flex-1 gap-1.5" />}
      />
    )
    for (const text of ["Smart play", "Go for it", "7-Wood", "43% unmapped"]) expect(html).toContain(text)

    // Each row: its own fixed height class, clipped, never shrunk, and no wrapping below md.
    const rows = [...html.matchAll(/<div[^>]*?data-dock-row="(status|plays|chips)"[^>]*?class="([^"]*)"|<div[^>]*?class="([^"]*)"[^>]*?data-dock-row="(status|plays|chips)"/g)]
    expect(rows).toHaveLength(3)
    for (const m of rows) {
      const row = (m[1] ?? m[4]) as keyof typeof DOCK_ROW_CLASS
      const phone = (m[2] ?? m[3]).split(" ").filter((c) => !c.includes(":"))
      expect(phone).toContain(DOCK_ROW_CLASS[row])
      expect(phone).toContain("shrink-0")
      expect(phone).toContain("overflow-hidden")
      expect(phone).not.toContain("flex-wrap")
      expect(Number(DOCK_ROW_CLASS[row].slice(2)) * 4).toBe(DOCK_ROW_PX[row]) // class and px constant agree
    }

    // Each card is as tall as the plays row, with exactly two lines that both truncate.
    const cards = [...html.matchAll(/<button[^>]*aria-pressed[^>]*class="([^"]*)"[^>]*>(.*?)<\/button>/g)].filter(([, , inner]) => inner.includes("Smart play") || inner.includes("Go for it"))
    expect(cards).toHaveLength(2)
    for (const [, cls, inner] of cards) {
      expect(cls.split(" ")).toEqual(expect.arrayContaining(["h-full", "overflow-hidden"]))
      expect(inner.match(/class="block truncate/g)).toHaveLength(2)
    }
  })
})
