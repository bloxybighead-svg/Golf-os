import { describe, expect, it } from "vitest"
import { DEFAULT_BAG } from "./bag"
import { fullBagShots, stableSeed } from "./bagShots"
import type { Club } from "./tables"

const shotsOf = (bag: Club[], seedKey = "") => Object.fromEntries(fullBagShots({ myBag: null, handicap: 10, typed: {}, bag, seedKey }).map((c) => [c.club, c.shots]))

describe("per-club seeds", () => {
  it("adding, removing or reordering clubs leaves every other club's shots identical", () => {
    const base = shotsOf(DEFAULT_BAG)
    const more = shotsOf([...DEFAULT_BAG, "7-Wood", "4-Iron"])
    const fewer = shotsOf(DEFAULT_BAG.filter((c) => c !== "8-Iron"))
    const reordered = shotsOf([...DEFAULT_BAG].reverse())
    for (const c of DEFAULT_BAG) {
      expect(more[c], c).toEqual(base[c])
      expect(reordered[c], c).toEqual(base[c])
      if (c !== "8-Iron") expect(fewer[c], c).toEqual(base[c])
    }
  })
  it("same key, same shots; a different key (hole or ball position), different shots", () => {
    expect(shotsOf(["Driver"], "a|1|tee").Driver).toEqual(shotsOf(["Driver"], "a|1|tee").Driver)
    expect(shotsOf(["Driver"], "a|1|tee").Driver).not.toEqual(shotsOf(["Driver"], "a|2|tee").Driver)
    expect(stableSeed("x")).toBe(stableSeed("x"))
  })
})
