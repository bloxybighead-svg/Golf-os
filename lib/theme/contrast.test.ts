import { readFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { AA_BODY, BACKGROUND_TOKENS, TEXT_TOKENS, contrastRatio, readThemes } from "./contrast"

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8")
const themes = readThemes(css)

describe("contrast math", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5)
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 1) // #777 on white: the classic near miss
  })
})

describe("globals.css tokens", () => {
  it("keeps the two dark blocks identical", () => {
    expect(themes.darkSystem).toEqual(themes.darkForced)
  })

  for (const [name, set] of Object.entries({ light: themes.light, dark: themes.darkSystem })) {
    describe(`${name} theme`, () => {
      for (const text of TEXT_TOKENS) {
        for (const bg of BACKGROUND_TOKENS) {
          it(`${text} on ${bg} is at least AA body (4.5:1)`, () => {
            expect(contrastRatio(set[text], set[bg])).toBeGreaterThanOrEqual(AA_BODY)
          })
        }
      }
      it("on-accent text on an accent fill is at least AA body", () => {
        expect(contrastRatio(set["on-accent"], set.accent)).toBeGreaterThanOrEqual(AA_BODY)
      })
    })
  }
})
