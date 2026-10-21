import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { landingPoint } from "@/lib/course/geo"
import { LastShotLine } from "@/components/play/LastShotLine"
import type { SwingShot } from "@/lib/rounds/shots"

const tee = { lat: 40, lng: -74 }
const shot: SwingShot = {
  holeNumber: 7, shotNumber: 2, club: "7-Iron", clubConfirmed: false, from: tee, fromLie: "fairway",
  to: landingPoint(tee, 0, 162, 0), toLie: "fairway", penaltyStrokes: 0, pin: landingPoint(tee, 0, 400, 0),
}
const noop = () => {}
const totals = new Map([["7-Iron", 150]])

describe("LastShotLine", () => {
  it("says the club is suggested until the golfer picks it, with the distance and an Edit button", () => {
    const html = renderToStaticMarkup(<LastShotLine shot={shot} ball={null} clubs={["Driver", "7-Iron"]} totalByClub={totals} onEdit={noop} onDelete={noop} onAdd={noop} />)
    expect(html).toContain("7-Iron")
    expect(html).toContain("(suggested)")
    expect(html).toContain("162 yd")
    expect(html).toContain("Edit")
    expect(renderToStaticMarkup(<LastShotLine shot={{ ...shot, clubConfirmed: true }} ball={null} clubs={[]} totalByClub={totals} onEdit={noop} onDelete={noop} onAdd={noop} />)).not.toContain("suggested")
  })

  it("warns when the shot is longer than the club goes", () => {
    const long = { ...shot, to: landingPoint(tee, 0, 291, 0) }
    const html = renderToStaticMarkup(<LastShotLine shot={long} ball={null} clubs={["7-Iron"]} totalByClub={totals} onEdit={noop} onDelete={noop} onAdd={noop} />)
    expect(html).toContain("Longer than your 7-Iron goes")
    expect(html).toContain("Add one")
    expect(html).not.toContain(">Edit<")
  })
})
