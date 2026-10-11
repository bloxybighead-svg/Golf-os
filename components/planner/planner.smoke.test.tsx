// Smoke tests for the Play planner's extracted components: they render to HTML
// (react-dom/server, no browser needed) with fixture data and show what the
// page showed before the split.

import type { ComponentProps } from "react"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ClubPlan, OptimizedClubPlan } from "@/lib/course/plan"
import { ClubTable } from "./ClubTable"
import { ScoringDetails } from "./ScoringDetails"
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
      chosenLive={plan("4-Iron", 4.6, 0.02, 190)}
      clubChoice="auto"
      fromLabel="the tee"
      hole={null}
      baselineHandicap={10}
      atBestAim
      aimLie="fairway"
      chosenAtAim={4.6}
      distPin={364}
      greenYards={{ front: 352, center: 364, back: 376 }}
      avgLeft={187}
      estimateNotes={{ "4-Iron": "No 4-Iron shots on record: estimated from your 5-Iron" }}
      holeQuality={null}
      geometry={null}
      onEditHole={() => {}}
      onStartDraw={() => {}}
      onConfirmHazard={() => {}}
      onAimAtBest={() => {}}
      onBackToBest={() => {}}
      options={null}
      onPickOption={() => {}}
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

  it("ResultCard: the visible card is the club, where to aim, front/center/back and the risk line", () => {
    const html = renderToStaticMarkup(card({ chosen: { ...fourIron, plan: { ...fourIron.plan, lieShare: { ...fourIron.plan.lieShare, oob: 0.02 } } } })).replace(/<!-- -->/g, "")
    const [visible, why] = html.split("<details")
    for (const text of ["4-Iron", "Aim 4 yd left of the middle of the fairway", "Front", "Center", "Back", "352", "364", "376", "2% OB", "leaves ~187"]) {
      expect(visible).toContain(text)
    }
    for (const text of ["4.60", "10.0 handicap", "estimated from your 5-Iron", "Expected strokes"]) expect(visible).not.toContain(text)
    expect(why).toContain("Why")
    expect(why).toContain("Expected strokes</span> <span class=\"tabular-nums text-fg-2\">4.6<")
    expect(why).toContain("a 10.0 handicap")
    expect(why).toContain("No 4-Iron shots on record: estimated from your 5-Iron.")
    expect(visible).not.toContain("Use best aim") // already at the best aim
    expect(why).not.toContain("At your aim")
  })

  it("ResultCard: a picked club shows as your pick, with the gap to the best club as a difference", () => {
    const html = renderToStaticMarkup(card({ chosen: threeWood, clubChoice: "3-Wood", chosenLive: plan("3-Wood", 4.61, 0.03, 243), chosenAtAim: 4.71, atBestAim: false, avgLeft: 118 }))
    const [visible, why] = html.split("<details")
    expect(visible).toContain("Your pick")
    expect(visible).toContain("Back to best club")
    expect(visible).toContain("Use best aim")
    expect(why).toContain("vs 4-Iron")
    expect(why).toContain("+0.01")
    expect(why).toContain("a tie, within the noise")
    expect(why).toContain("+0.10") // at your aim: 4.71 against the 4.61 at its best aim
    expect(why).not.toContain("4.61") // never two absolute strokes side by side
  })

  it("ResultCard: plays-like sits under Center only when it changes it by a yard or more; the breakdown is in Why", () => {
    const render = (plays: number) => renderToStaticMarkup(card({ pinPlaysLike: { plays, breakdown: "+7 uphill, -9 wind helping, +3 cold (40°F)" } }))
    expect(render(365).split("<details")[0]).toContain("plays 365")
    expect(render(365).split("<details")[0]).not.toContain("uphill")
    expect(render(365).split("<details")[1]).toContain("+7 uphill, -9 wind helping, +3 cold (40°F)")
    expect(render(364)).not.toContain("plays 364")
  })

  it("ResultCard: with no mapped green the center is the pin distance and front and back are blank", () => {
    const html = renderToStaticMarkup(card({ greenYards: null })).split("<details")[0]
    expect(html).toContain("364")
    expect(html.match(/–/g)).toHaveLength(2)
  })

  it("ScoringDetails: the aim-line and aim-to-pin distances live in the details", () => {
    const html = renderToStaticMarkup(<ScoringDetails distAim={190} aimToPin={188} aimIsPin={false} baselineHandicap={null} onCourseSpread={1.2} />)
    expect(html).toContain("Aim line 190 yd")
    expect(html).toContain("Aim to pin 188 yd")
  })

  it("StrategyToggle: both plays with strokes and penalty share", () => {
    const html = renderToStaticMarkup(
      <StrategyToggle
        options={{ safer: pw, lowest: fourIron, same: false } as never}
        chosen={fourIron}
        onPick={() => {}}
        compact
      />
    )
    expect(html).toContain("Smart play")
    expect(html).toContain("Go for it")
    expect(html).toContain("4.60 strokes")
  })

  it("unmapped warning: above 25% the recommendation stays and the warning sits in Why", () => {
    const render = (share: number) => {
      const p: OptimizedClubPlan = { ...fourIron, plan: { ...fourIron.plan, unmappedShare: share } }
      return renderToStaticMarkup(card({ best: p, chosen: p, chosenLive: p.plan }))
    }
    const [visible, why] = render(0.47).split("<details")
    expect(visible).toContain("4-Iron")
    expect(visible).not.toContain("unmapped")
    expect(why).toContain("47%")
    expect(why).toContain("of this pattern is on unmapped ground")
    expect(why).toContain("Check the")
    expect(render(0.25)).not.toContain("of this pattern is on unmapped ground")
    expect(render(0.26)).toContain("of this pattern is on unmapped ground")
  })

  it("StrategyToggle: flags the chosen play when much of it is on unmapped ground", () => {
    const html = renderToStaticMarkup(
      <StrategyToggle options={{ safer: fourIron, lowest: fourIron, same: true } as never} chosen={fourIron} onPick={() => {}} compact unmappedWarning={0.54} />
    )
    expect(html).toContain("Best play")
    expect(html).toContain('aria-label="54% unmapped. Show why"')
    expect(html).not.toContain(">54% unmapped<") // the words live in the icon, not on the card
  })

  it("phone dock: three fixed rows, cards of two truncating lines, nothing that can wrap", () => {
    const sevenWood: OptimizedClubPlan = { ...fourIron, club: "7-Wood", plan: { ...plan("7-Wood", 4.6, 0.02, 200), unmappedShare: 0.43 } }
    const html = renderToStaticMarkup(
      <PlayDock
        scoring={false}
        status={<button>Start round</button>}
        plays={<StrategyToggle options={{ safer: sevenWood, lowest: sevenWood, same: false } as never} chosen={sevenWood} onPick={() => {}} compact unmappedWarning={0.43} />}
        chips={<ClubChips ranking={[sevenWood, pw]} chosen={sevenWood} onPick={() => {}} className="flex min-w-0 flex-1 gap-1.5" />}
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
    const cards = [...html.matchAll(/<button[^>]*aria-pressed[^>]*class="([^"]*)"[^>]*>(.*?)<\/button>/g)].filter(([, , inner]) => inner.includes("strokes"))
    expect(cards).toHaveLength(2)
    for (const [, cls, inner] of cards) {
      expect(cls.split(" ")).toEqual(expect.arrayContaining(["h-full", "overflow-hidden"]))
      expect(inner.match(/class="block truncate/g)).toHaveLength(2)
    }
  })
})
