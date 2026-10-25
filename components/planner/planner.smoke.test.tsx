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
      chosenAtAim={4.6}
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
    expect(html).toContain(">4.6<") // expected strokes, one decimal, beside the club
    expect(html).toContain("Expected strokes")
    for (const text of ["handicap", "Wind", "Fairway", "Greens", "Bunkers", "Water", "Shots", "unmapped", "leaves", "Best play", "Best club"]) {
      expect(html).not.toContain(text)
    }
    expect(html).not.toContain("Use best aim") // already at the best aim
  })

  it("ResultCard: expected strokes follow the aim marker", () => {
    expect(renderToStaticMarkup(card({ atBestAim: false, chosenAtAim: 5.04 }))).toContain(">5.0<")
    expect(renderToStaticMarkup(card({ atBestAim: false, chosenAtAim: 5.26 }))).toContain(">5.3<")
    expect(renderToStaticMarkup(card({ atBestAim: true, chosenAtAim: 5.26 }))).toContain(">4.6<")
  })

  it("ResultCard: no OB or water line: the risk lives on the strategy card only", () => {
    const risky: OptimizedClubPlan = { ...fourIron, plan: { ...fourIron.plan, lieShare: { ...fourIron.plan.lieShare, oob: 0.03, water: 0.08 } } }
    const html = renderToStaticMarkup(card({ chosen: risky }))
    expect(html).not.toContain("water")
    expect(html).not.toContain("OB")
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
    expect(html).toContain('Expected strokes</span> <span class="text-fg-2">4.6<')
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

  it("StrategyToggle (cards): both plays with their biggest risk", () => {
    const risky: OptimizedClubPlan = { ...pw, plan: { ...pw.plan, lieShare: { ...pw.plan.lieShare, oob: 0.04 } } }
    const html = renderToStaticMarkup(<StrategyToggle options={{ safer: risky, lowest: fourIron, same: false } as never} chosen={fourIron} onPick={() => {}} />)
    expect(html).toContain("Smart play")
    expect(html).toContain("Go for it")
    expect(html).toContain("4% OB")
    expect(html).not.toContain("strokes")
  })

  it("ClubChips: with all, every club is a chip in a strip that scrolls, and All clubs is its last chip", () => {
    const ranking = [fourIron, threeWood, pw, { ...pw, club: "9-Iron" }, { ...pw, club: "SW" }]
    const html = renderToStaticMarkup(<ClubChips ranking={ranking} chosen={fourIron} onPick={() => {}} onMore={() => {}} all />)
    for (const c of ranking) expect(html).toContain(c.club)
    expect(html.indexOf("SW")).toBeLessThan(html.indexOf("All clubs")) // the button follows the last club inside the same strip
    expect(html.match(/<\/div>/g)).toHaveLength(2) // the strip and the group: nothing sits beside the strip
    expect(html).toContain("overflow-x-auto")
  })

  it("StrategyToggle (compact): the chosen club and its risk in full, then a Smart | Go switch", () => {
    const risky = (oob: number, water = 0): OptimizedClubPlan => ({ ...threeWood, plan: { ...threeWood.plan, lieShare: { ...threeWood.plan.lieShare, oob, water, trees: 0.4 } } })
    const options = { safer: risky(0.07), lowest: fourIron, same: false } as never
    const html = renderToStaticMarkup(<StrategyToggle options={options} chosen={risky(0.07)} onPick={() => {}} compact onOpen={() => {}} />).replace(/<!-- -->/g, "")
    expect(html).toContain("3-Wood")
    expect(html).toContain("· 7% OB") // trees are not a penalty: never in the dock
    expect(html).not.toContain("truncate")
    expect(html).not.toContain("Expected")
    expect(html).not.toContain("<svg") // under 10%: no warning icon
    expect(html).toMatch(/aria-pressed="true"[^>]*>Smart</)
    expect(html).toContain(">Go<")
    expect(html).not.toContain("Smart play")
    expect(renderToStaticMarkup(<StrategyToggle options={options} chosen={risky(0, 0.12)} onPick={() => {}} compact />)).toContain("<svg")
    const same = renderToStaticMarkup(<StrategyToggle options={{ safer: fourIron, lowest: fourIron, same: true } as never} chosen={fourIron} onPick={() => {}} compact />)
    expect(same).not.toContain("Smart")
    expect(same).not.toContain(">Go<")
  })

  it("ClubChips: the best three, a tie marked, then All clubs", () => {
    const tied: OptimizedClubPlan = { ...pw, plan: { ...pw.plan, expectedStrokes: 4.61, strokesSe: 0.03 } }
    const html = renderToStaticMarkup(<ClubChips ranking={[fourIron, tied, threeWood, pw]} chosen={fourIron} onPick={() => {}} onMore={() => {}} />)
    for (const text of ["4-Iron", "PW", "3-Wood", "All clubs"]) expect(html).toContain(text)
    expect(html.match(/≈/g)).toHaveLength(2) // PW and 3-Wood are within the noise of the best
    expect(html).not.toContain("aria-hidden") // no rank numerals
    const ninth: OptimizedClubPlan = { ...pw, club: "9-Iron" }
    const fourth = renderToStaticMarkup(<ClubChips ranking={[fourIron, tied, threeWood, ninth]} chosen={ninth} onPick={() => {}} onMore={() => {}} />)
    expect(fourth).toContain("9-Iron") // a pick from the table takes the third chip
    expect(fourth).not.toContain("3-Wood")
  })

  it("PlayDock: three fixed rows, nothing that can wrap", () => {
    const html = renderToStaticMarkup(
      <PlayDock
        status={<button>Start round</button>}
        plays={<StrategyToggle options={{ safer: pw, lowest: fourIron, same: false } as never} chosen={fourIron} onPick={() => {}} compact />}
        chips={<ClubChips ranking={[fourIron, pw]} chosen={fourIron} onPick={() => {}} onMore={() => {}} className="flex min-w-0 flex-1 gap-1.5" />}
      />
    )
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
  })
})
