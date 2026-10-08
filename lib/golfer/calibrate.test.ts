import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import path from "path"
import { parseCsv } from "@/lib/shots/parseCsv"
import { calibrate, type FitShot } from "./calibrate"

// Fixtures: synthetic_shots.csv is shot-pattern-simulator/reference_data/synthetic_shots.csv
// (a generic 3-handicap from a fixed seed, no real data); synthetic_fit.json is what
// `python calibrate.py synthetic_shots.csv --min-shots 10` wrote from its full swings.
// Regenerate both together with `python make_synthetic_fixtures.py` if calibrate.py changes.
const dir = path.join(__dirname, "__fixtures__")
const rows = parseCsv(readFileSync(path.join(dir, "synthetic_shots.csv"), "utf8"))
const header = rows[0]
const col = (name: string) => header.indexOf(name)
const all = rows.slice(1).map((r) => ({
  club: r[col("club")],
  carryYds: Number(r[col("carry_yds")]),
  offlineYds: Number(r[col("offline_yds")]),
  curveYds: Number(r[col("curve_yds")]),
  launchDirDeg: Number(r[col("launch_dir_deg")]),
  partial: r[col("is_partial")] === "True",
}))
const full: FitShot[] = all.filter((s) => !s.partial)
const expected = JSON.parse(readFileSync(path.join(dir, "synthetic_fit.json"), "utf8")) as Record<string, Record<string, number>>

describe("calibrate.ts parity with calibrate.py", () => {
  const fit = calibrate(full)

  it("fits the same clubs (same min-shots rule, partials excluded)", () => {
    expect(Object.keys(fit).sort()).toEqual(Object.keys(expected).sort())
    expect(all.length - full.length).toBe(138)
  })

  // The Python rounds to 1/4/2/4/4/3 places; one unit in the last place is the
  // most a different float summation order can move a value.
  const tol: Record<string, number> = {
    mean_carry: 0.11,
    distance_cv: 0.00011,
    direction_sd_deg: 0.011,
    start_line_bias_deg: 0.011,
    start_line_sd_deg: 0.011,
    curve_bias_pct: 0.00011,
    curve_sd_pct: 0.00011,
    curve_carry_slope: 0.0011,
    n_shots: 0,
  }
  for (const club of Object.keys(expected)) {
    it(`${club} matches`, () => {
      for (const [k, t] of Object.entries(tol)) {
        const got = (fit[club] as unknown as Record<string, number>)[k]
        expect(Math.abs(got - expected[club][k]), `${club}.${k}: ts ${got} vs py ${expected[club][k]}`).toBeLessThanOrEqual(t)
      }
    })
  }

  it("equal weights change nothing", () => {
    const weighted = calibrate(full.map((s) => ({ ...s, weight: 3 })))
    expect(weighted["Driver"].mean_carry).toBe(fit["Driver"].mean_carry)
    expect(weighted["Driver"].distance_cv).toBe(fit["Driver"].distance_cv)
  })

  it("falls back to the curve-share split when a club has no measured curve", () => {
    const shots: FitShot[] = Array.from({ length: 12 }, (_, i) => ({ club: "7-Iron", carryYds: 150 + (i % 4), offlineYds: (i % 5) - 2 }))
    const p = calibrate(shots)["7-Iron"]
    expect(p.curve_bias_pct).toBe(0)
    expect(p.curve_carry_slope).toBe(-0.2)
    expect(p.start_line_sd_deg).toBeGreaterThan(0)
  })
})
