import { describe, expect, it } from "vitest"
import { groupPartials } from "./partialGroups"

describe("groupPartials", () => {
  it("puts each partial under its full club and keeps the whole-ranking rank", () => {
    const rows = ["SW 3/4", "PW", "SW", "SW 1/2"].map((club) => ({ club }))
    const g = groupPartials(rows)
    expect(g.map((x) => [x.row.club, x.rank])).toEqual([["PW", 2], ["SW", 3]])
    expect(g[1].partials.map((p) => [p.row.club, p.rank])).toEqual([["SW 3/4", 1], ["SW 1/2", 4]])
  })

  it("keeps a partial whose full club is not ranked as a row of its own", () => {
    expect(groupPartials([{ club: "GW 1/2" }, { club: "PW" }]).map((x) => x.row.club)).toEqual(["PW", "GW 1/2"])
  })
})
