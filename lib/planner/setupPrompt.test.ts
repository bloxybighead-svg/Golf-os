import { describe, expect, it } from "vitest"
import { bannerVisible, dismissed, dotVisible, FRESH_PROMPT, parsePrompt, recordView, SETUP_PROMPT_MAX_VIEWS } from "./setupPrompt"

describe("setup prompt", () => {
  it("shows the banner for the first 3 views, then collapses to a dot", () => {
    let s = FRESH_PROMPT
    for (let i = 1; i <= SETUP_PROMPT_MAX_VIEWS; i++) {
      s = recordView(s)
      expect(bannerVisible(s)).toBe(true)
      expect(dotVisible(s, false)).toBe(false)
    }
    s = recordView(s) // the 4th visit
    expect(bannerVisible(s)).toBe(false)
    expect(dotVisible(s, false)).toBe(true)
  })
  it("collapses at once on dismissal", () => {
    const s = dismissed(recordView(FRESH_PROMPT))
    expect(bannerVisible(s)).toBe(false)
    expect(dotVisible(s, false)).toBe(true)
  })
  it("never shows a dot once setup is done", () => {
    expect(dotVisible(dismissed(FRESH_PROMPT), true)).toBe(false)
  })
  it("reads junk as a fresh prompt", () => {
    expect(parsePrompt(null)).toEqual(FRESH_PROMPT)
    expect(parsePrompt("{{")).toEqual(FRESH_PROMPT)
    expect(parsePrompt('{"views":-3,"dismissed":"yes"}')).toEqual(FRESH_PROMPT)
    expect(parsePrompt('{"views":2,"dismissed":true}')).toEqual({ views: 2, dismissed: true })
  })
})
