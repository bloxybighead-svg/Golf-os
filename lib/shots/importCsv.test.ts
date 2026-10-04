import { describe, expect, it } from "vitest"
import {
  ImportError,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROWS,
  YARDS_PER_METRE,
  detectFormat,
  guessMapping,
  parseDetected,
  parseSigned,
  parseTable,
  parseUpload,
  toIsoDate,
  type Detected,
  type ImportSettings,
} from "./importCsv"

// Fixtures are synthetic: built from the layouts the app's own data uses, not
// copies of anyone's real export.

const SESSION_SUMMARY = [
  "7i,,,,,,,,,,,,",
  "Shot,Date,Time,Carry,Total,Roll,Offline,Curve,Apex,Spin,Ball Speed,Club Speed,Launch Direction",
  "1,07/01/2026,10:01,160.4,170.1,9.7,3.0 L,2.8 R,90,6500,118.0,88.0,1.2 L",
  "2,07/01/2026,10:02,158.0,166.0,8.0,5.5 R,0.0,88,6400,117.0,87.5,2.0 R",
  "Average,,,159.2,,,,,,,,,",
  "Dr,,,,,,,,,,,,",
  "Shot,Date,Time,Carry,Total,Roll,Offline,Curve,Apex,Spin,Ball Speed,Club Speed,Launch Direction",
  "1,07/01/2026,10:20,251.0,270.0,19.0,12.0 R,14.0 R,95,2500,155.0,108.0,-1.0",
].join("\n")

const mappingOf = (d: Detected) => {
  if (d.kind !== "table") throw new Error("not a table")
  return d.mapping
}

const US: ImportSettings = { distanceUnit: "yd", leftIsNegative: true }

function table(text: string, settings: ImportSettings = US) {
  const rows = parseUpload(text)
  const detected = detectFormat(rows)
  const mapping = detected.kind === "table" ? detected.mapping : guessMapping([])
  return { rows, detected, result: parseDetected(rows, detected, mapping, settings) }
}

describe("session-summary export (the format parse_sessions.py reads)", () => {
  const { detected, result } = table(SESSION_SUMMARY)
  it("is detected and parsed per club block, with L/R converted to signs", () => {
    expect(detected.kind).toBe("session-summary")
    expect(result.shots).toHaveLength(3)
    expect(result.shots[0]).toMatchObject({ club: "7-Iron", carryYds: 160.4, offlineYds: -3, curveYds: 2.8, launchDirDeg: -1.2 })
    expect(result.shots[1]).toMatchObject({ offlineYds: 5.5, curveYds: 0, launchDirDeg: 2 })
    expect(result.shots[2]).toMatchObject({ club: "Driver", offlineYds: 12, curveYds: 14, launchDirDeg: -1 })
  })
  it("takes the date from the rows", () => {
    expect(result.date).toBe("2026-07-01")
  })
  it("ignores the Average row", () => {
    expect(result.shots.every((s) => s.carryYds !== 159.2)).toBe(true)
  })
})

describe("header-named tables", () => {
  it("auto-detects Club / Carry / Offline and a bare-number sign convention", () => {
    const { detected, result } = table("Club,Carry,Offline\n7 Iron,150,-4\n7 Iron,152,6\nPutter,10,0\nAverage,151,1")
    expect(detected).toMatchObject({ kind: "table", complete: true })
    expect(result.shots.map((s) => [s.club, s.carryYds, s.offlineYds])).toEqual([["7-Iron", 150, -4], ["7-Iron", 152, 6]])
    expect(result.unknownClubs).toEqual({ Putter: 1 })
  })

  it("finds the header below a preamble and reads names with units", () => {
    const { detected, result } = table("Session report\nPlayer,Sam\nClub Type,Carry Distance (yds),Side (yds),Launch Direction (deg),Curve (yds),Date\n8i,141,2,0.5,3,2026-05-02")
    expect(detected).toMatchObject({ kind: "table", headerRow: 2, complete: true, unitHint: "yd" })
    expect(result.shots[0]).toMatchObject({ club: "8-Iron", carryYds: 141, offlineYds: 2, launchDirDeg: 0.5, curveYds: 3 })
    expect(result.date).toBe("2026-05-02")
  })

  it("converts metres to yards", () => {
    const { detected, result } = table("Club,Carry (m),Offline (m)\n7i,100,-10")
    expect(detected).toMatchObject({ unitHint: "m" })
    const m = parseDetected(parseUpload("Club,Carry (m),Offline (m)\n7i,100,-10"), detected, mappingOf(detected), { distanceUnit: "m", leftIsNegative: true })
    expect(m.shots[0].carryYds).toBeCloseTo(100 * YARDS_PER_METRE, 6)
    expect(m.shots[0].offlineYds).toBeCloseTo(-10 * YARDS_PER_METRE, 6)
    expect(result.shots[0].carryYds).toBe(100) // same file read as yards: the unit is the golfer's setting, hinted by the header
  })

  it("flips the sign when the file writes left as positive, but never for L/R values", () => {
    const rows = parseUpload("Club,Carry,Offline\n7i,150,4\n7i,150,3 L\n7i,150,3 R")
    const d = detectFormat(rows)
    const r = parseTable(rows, 0, mappingOf(d), { distanceUnit: "yd", leftIsNegative: false })
    expect(r.shots.map((s) => s.offlineYds)).toEqual([-4, -3, 3])
  })

  it("derives offline from launch direction when there is no offline column", () => {
    const { result } = table("Club,Carry,Launch Direction\n7i,100,2")
    expect(result.shots[0].offlineYds).toBeCloseTo(100 * Math.tan((2 * Math.PI) / 180), 6)
  })

  it("skips rows with a bad carry or no direction, and counts them", () => {
    const { result } = table("Club,Carry,Offline\n7i,abc,1\n7i,1,1\n7i,150,\n7i,150,2")
    expect(result.shots).toHaveLength(1)
    expect(result.skipped).toBe(3)
  })

  it("reads partial and quoted fields", () => {
    const { result } = table('Club,Carry,Offline,Partial\n"7i",150,1,yes\n7i,151,1,no')
    expect(result.shots.map((s) => s.isPartial)).toEqual([true, false])
  })

  it("an unknown layout needs a mapping, and a hand-made mapping parses it", () => {
    const rows = parseUpload("Stick,Dist,Miss\n7i,150,3")
    const d = detectFormat(rows)
    expect(d).toMatchObject({ kind: "table", complete: false })
    const r = parseTable(rows, 0, { club: 0, carry: 1, offline: 2, launchDir: -1, curve: -1, partial: -1, date: -1 }, US)
    expect(r.shots[0]).toMatchObject({ club: "7-Iron", carryYds: 150, offlineYds: 3 })
  })
})

describe("limits and small parsers", () => {
  it("rejects a file over 2 MB or 5,000 rows, and an empty one", () => {
    expect(() => parseUpload("a", MAX_UPLOAD_BYTES + 1)).toThrow(ImportError)
    expect(() => parseUpload("Club,Carry\n" + "7i,150\n".repeat(MAX_UPLOAD_ROWS))).toThrow(/limit/)
    expect(parseUpload("Club,Carry\n" + "7i,150\n".repeat(MAX_UPLOAD_ROWS - 1))).toHaveLength(MAX_UPLOAD_ROWS)
    expect(() => parseUpload("  \n")).toThrow(ImportError)
  })
  it("parses L/R values", () => {
    expect(parseSigned("3.0 L")).toEqual({ value: -3, hasSide: true })
    expect(parseSigned("2.8 R")).toEqual({ value: 2.8, hasSide: true })
    expect(parseSigned("L 4")).toEqual({ value: -4, hasSide: true })
    expect(parseSigned("-4.6")).toEqual({ value: -4.6, hasSide: false })
    expect(parseSigned("n/a")).toBeNull()
    expect(parseSigned("")).toBeNull()
  })
  it("reads US and ISO dates", () => {
    expect(toIsoDate("07/01/2026")).toBe("2026-07-01")
    expect(toIsoDate("7/4/26")).toBe("2026-07-04")
    expect(toIsoDate("2026-07-01T10:00:00")).toBe("2026-07-01")
    expect(toIsoDate("13/45/2026")).toBeNull()
  })
})
