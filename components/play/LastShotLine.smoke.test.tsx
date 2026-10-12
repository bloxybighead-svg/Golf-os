import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { landingPoint } from "@/lib/course/geo"
import { LastShotLine } from "@/components/play/LastShotLine"
import type { SwingShot } from "@/lib/rounds/shots"

const tee = { lat: 40, lng: -74 }
const shot: SwingShot = {
  holeNumber: 7, shotNumber: 2, club: "7-Iron", from: tee, fromLie: "fairway",
  to: landingPoint(tee, 0, 162, 0), toLie: "fairway", penaltyStrokes: 0, pin: landingPoint(tee, 0, 400, 0),
}

describe("LastShotLine", () => {
  it("says what was recorded, with an Edit button", () => {
    const html = renderToStaticMarkup(<LastShotLine shot={shot} clubs={["Driver", "7-Iron"]} onEdit={() => {}} />)
    expect(html).toContain("Last shot: 7-Iron, fairway, 162 yd")
    expect(html).toContain("Edit")
  })
})
