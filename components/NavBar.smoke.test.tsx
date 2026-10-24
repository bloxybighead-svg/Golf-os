import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

const mocks = vi.hoisted(() => ({ path: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path }))
vi.mock("@/hooks/useIsCompact", () => ({ useIsCompact: () => true }))
vi.mock("@/hooks/useRoundMode", () => ({ useRoundMode: () => ({ on: false, round: null, session: null }) }))

import NavBar from "./NavBar"

/** The tabs in order, each with whether it is the current page. */
function tabs(path: string) {
  mocks.path = path
  const html = renderToStaticMarkup(<NavBar />)
  return [...html.slice(html.indexOf("aria-label=\"Main\"")).matchAll(/<a ([^>]*)>/g)]
    .map((m) => [/href="([^"]+)"/.exec(m[1])?.[1] ?? "", m[1].includes('aria-current="page"')] as const)
    .filter(([href]) => ["/", "/you/practice", "/rounds", "/you"].includes(href))
}

describe("the tab bar", () => {
  it("has Practice between Play and Rounds", () => {
    expect(tabs("/").map(([href]) => href)).toEqual(["/", "/you/practice", "/rounds", "/you"])
    expect(renderToStaticMarkup(<NavBar />)).toContain("Practice")
  })

  it("lights Practice, not You, on the practice pages", () => {
    for (const path of ["/you/practice", "/you/practice/run", "/you/practice/older"]) {
      expect(tabs(path)).toEqual([["/", false], ["/you/practice", true], ["/rounds", false], ["/you", false]])
    }
  })

  it("still lights You for the rest of /you", () => {
    expect(tabs("/you/stats")).toEqual([["/", false], ["/you/practice", false], ["/rounds", false], ["/you", true]])
    expect(tabs("/you")[3]).toEqual(["/you", true])
  })
})
