// Smoke tests for the Play planner's extracted components: they render to HTML
// (react-dom/server, no browser needed) with fixture data and show what the
// page showed before the split.

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ClubPlan, OptimizedClubPlan } from "@/lib/course/plan"
import { ClubTable } from "./ClubTable"
import { HoleHeader } from "./HoleHeader"
import { StrategyToggle } from "./StrategyToggle"
import { ResultCard } from "./ResultCard"

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
    expect(html).toContain("4 L")
    expect(html).toContain("10 R")
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

  it("ResultCard: best club, strokes, baseline and distances", () => {
    const html = renderToStaticMarkup(
      <ResultCard
        best={fourIron}
        chosen={fourIron}
        chosenLive={plan("4-Iron", 4.6, 0.02, 190)}
        clubChoice="auto"
        fromLabel="the tee"
        hole={null}
        baselineHandicap={10}
        atBestAim
        chosenAtAim={4.6}
        distAim={190}
        distPin={364}
        aimToPin={188}
        aimIsPin={false}
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
      />
    )
    expect(html).toContain("Best club")
    expect(html).toContain("4.60")
    expect(html).toContain("vs a 10.0 handicap")
    expect(html).toContain("No 4-Iron shots on record: estimated from your 5-Iron.")
    expect(html).not.toContain("Use best aim") // already at the best aim
    expect(html).not.toContain("At your aim")
  })

  it("ResultCard: a picked club shows as your pick, with the best club and the gap", () => {
    const html = renderToStaticMarkup(
      <ResultCard
        best={fourIron}
        chosen={threeWood}
        chosenLive={plan("3-Wood", 4.61, 0.03, 243)}
        clubChoice="3-Wood"
        fromLabel="the tee"
        hole={null}
        baselineHandicap={10}
        atBestAim
        chosenAtAim={4.61}
        distAim={249}
        distPin={364}
        aimToPin={120}
        aimIsPin={false}
        avgLeft={118}
        estimateNotes={{}}
        holeQuality={null}
        geometry={null}
        onEditHole={() => {}}
        onStartDraw={() => {}}
        onConfirmHazard={() => {}}
        onAimAtBest={() => {}}
        onBackToBest={() => {}}
        options={null}
        onPickOption={() => {}}
      />
    )
    expect(html).toContain("Your pick")
    expect(html).toContain("Best: 4-Iron (+0.01)")
    expect(html).toContain("3-Wood")
    expect(html).toContain("Back to best club")
  })

  it("StrategyToggle: both plays with strokes and penalty share", () => {
    const html = renderToStaticMarkup(
      <StrategyToggle
        options={{ safer: pw, lowest: fourIron, same: false, noSafeOption: false } as never}
        chosen={fourIron}
        onPick={() => {}}
        compact
      />
    )
    expect(html).toContain("Smart play")
    expect(html).toContain("Go for it")
    expect(html).toContain("4.60 strokes")
  })
})
