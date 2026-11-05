// ScoringDetails must describe the model as it is: wind, ground height and slope are modelled (lib/course/playsLike.ts).

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ScoringDetails } from "./ScoringDetails"

function text(baselineHandicap: number | null) {
  return renderToStaticMarkup(<ScoringDetails baselineHandicap={baselineHandicap} onCourseSpread={1.2} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&rsquo;|&#x27;|’/g, "'")
    .replace(/\s+/g, " ")
}

describe("ScoringDetails", () => {
  it.each([null, 12])("does not claim wind or elevation are unmodelled (handicap %s)", (hcp) => {
    const t = text(hcp).toLowerCase()
    const denied = t.split(/(?<=[.;])\s/).filter((x) => /aren't modelled|not modelled|isn't modelled/.test(x))
    for (const sentence of denied) expect(sentence).not.toMatch(/(wind|elevation|ground height)/)
    expect(t).toContain("wind")
    expect(t).toContain("ground height")
  })

  it("uses no first-person voice", () => {
    expect(text(null)).not.toMatch(/\b(my|I|I'm|I'll)\b/)
  })
})
