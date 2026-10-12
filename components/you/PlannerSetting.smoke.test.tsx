import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PlannerSetting } from "@/components/you/PlannerSetting"
import type { SpreadSuggestion } from "@/lib/rounds/spreadCalibration"

const suggestion: SpreadSuggestion = {
  ratio: 1.32,
  shots: 41,
  groups: [
    { group: "woods", label: "Driver and woods", ratio: 1.4, shots: 21 },
    { group: "wedges", label: "Wedges", ratio: 1.24, shots: 20 },
  ],
}

describe("PlannerSetting spread suggestion", () => {
  it("offers the measured spread with an Apply button, and never applies it by itself", () => {
    const html = renderToStaticMarkup(<PlannerSetting spreadSuggestion={suggestion} />)
    expect(html).toContain("Your on-course spread: ")
    expect(html).toContain("1.32x")
    expect(html).toContain("(from 41 shots)")
    expect(html).toContain("Driver and woods 1.40x · Wedges 1.24x")
    expect(html).toContain("Apply")
    // The slider still reads the default until Apply is pressed.
    expect(html).toContain("1.25x")
  })

  it("shows nothing extra without a suggestion", () => {
    const html = renderToStaticMarkup(<PlannerSetting spreadSuggestion={null} />)
    expect(html).not.toContain("Apply")
    expect(html).not.toContain("Your on-course spread")
  })
})
