// Reads a launch-monitor or hand-made CSV into shots. Two layouts:
//  - the "session summary" export parse_sessions.py reads: a club label line
//    ("7i,"), a header, shot rows, an "Average" row; offline/curve written
//    "3.0 L" / "2.8 R".
//  - any table with a header row: columns found by name (club, carry, offline
//    or side, launch direction, curve, partial, date). When a name isn't
//    recognised the caller shows a column-mapping screen.
// Output is always yards, positive = right of target.

import { normalizeClubName } from "@/lib/golfer/clubNames"
import { parseCsv } from "./parseCsv"
import type { ParsedShot } from "./types"

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const MAX_UPLOAD_ROWS = 5000

/** Yards in a metre (1 / 0.9144). */
export const YARDS_PER_METRE = 1 / 0.9144
/** Carries outside this are typos or unit slips, not shots (a flop is ~10 yd, a long drive ~330). */
const MIN_CARRY_YDS = 3
const MAX_CARRY_YDS = 450

export class ImportError extends Error {}

export interface ImportSettings {
  distanceUnit: "yd" | "m"
  /** The file writes left misses as negative numbers (the usual way). Ignored for "3.0 L" / "2.8 R" values. */
  leftIsNegative: boolean
}

export const DEFAULT_SETTINGS: ImportSettings = { distanceUnit: "yd", leftIsNegative: true }

/** Column indexes; -1 = not in the file. */
export interface ColumnMapping {
  club: number
  carry: number
  offline: number
  launchDir: number
  curve: number
  partial: number
  date: number
}

export interface ParseResult {
  shots: ParsedShot[]
  /** First date found, YYYY-MM-DD. */
  date: string | null
  /** Rows that had a club and numbers but no usable shot (bad carry, no direction). */
  skipped: number
  /** Club labels the planner doesn't know, with how many rows each. */
  unknownClubs: Record<string, number>
}

export type Detected =
  | { kind: "session-summary" }
  | { kind: "table"; headerRow: number; headers: string[]; mapping: ColumnMapping; complete: boolean; unitHint: "yd" | "m" | null }

/** Reads the text of an upload, enforcing the size and row limits. */
export function parseUpload(text: string, byteLength = text.length): string[][] {
  if (byteLength > MAX_UPLOAD_BYTES) throw new ImportError(`That file is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
  const rows = parseCsv(text)
  if (rows.length === 0) throw new ImportError("That file is empty.")
  if (rows.length > MAX_UPLOAD_ROWS) throw new ImportError(`That file has ${rows.length} rows; the limit is ${MAX_UPLOAD_ROWS}.`)
  return rows
}

/** "3.0 L" -> -3, "2.8 R" -> 2.8, "L 3" -> -3. A bare number comes back with hasSide false; null when unreadable. */
export function parseSigned(value: string | undefined): { value: number; hasSide: boolean } | null {
  const v = (value ?? "").trim()
  if (!v) return null
  const m = v.match(/^(-?\d*\.?\d+)\s*([LR])?$/i)
  if (m) {
    const num = Number(m[1])
    if (!m[2]) return { value: num, hasSide: false }
    return { value: m[2].toUpperCase() === "L" ? -Math.abs(num) : Math.abs(num), hasSide: true }
  }
  const lead = v.match(/^([LR])\s*(-?\d*\.?\d+)$/i)
  if (lead) {
    const num = Number(lead[2])
    return { value: lead[1].toUpperCase() === "L" ? -Math.abs(num) : Math.abs(num), hasSide: true }
  }
  return null
}

function plainNumber(value: string | undefined): number | null {
  const v = (value ?? "").trim().replace(/,/g, "")
  if (!v || !/^-?\d*\.?\d+$/.test(v)) return null
  return Number(v)
}

// ---------- the session-summary layout ----------

// Column positions in that export (parse_sessions.py): 1 date, 3 carry,
// 6 offline, 7 curve, 12 launch direction.
const SS = { date: 1, carry: 3, offline: 6, curve: 7, launchDir: 12 } as const

function isClubLabelRow(r: string[]): boolean {
  const first = (r[0] ?? "").trim()
  if (!first || /^\d+$/.test(first) || first.toLowerCase() === "average") return false
  return (r.length < 3 || !(r[2] ?? "").trim()) && normalizeClubName(first) !== null
}

export function looksLikeSessionSummary(rows: string[][]): boolean {
  let sawLabel = false
  for (const r of rows) {
    if (isClubLabelRow(r)) sawLabel = true
    else if (sawLabel && /^\d+$/.test((r[0] ?? "").trim()) && plainNumber(r[SS.carry]) != null && r.length > SS.launchDir) return true
  }
  return false
}

export function toIsoDate(raw: string | undefined): string | null {
  const s = (raw ?? "").trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // US order (month first), as the launch monitors this app was built around write it.
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/)
  if (us) {
    const [mo, d] = [Number(us[1]), Number(us[2])]
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    const y = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3])
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  return null
}

export function parseSessionSummary(rows: string[][]): ParseResult {
  const shots: ParsedShot[] = []
  let club: ParsedShot["club"] | null = null
  let date: string | null = null
  let skipped = 0
  for (const r of rows) {
    if (isClubLabelRow(r)) {
      club = normalizeClubName(r[0])
      continue
    }
    if (!/^\d+$/.test((r[0] ?? "").trim())) continue
    if (club == null) continue
    const carry = plainNumber(r[SS.carry])
    const offline = parseSigned(r[SS.offline])
    if (carry == null || offline == null || carry < MIN_CARRY_YDS || carry > MAX_CARRY_YDS) {
      skipped++
      continue
    }
    date = date ?? toIsoDate(r[SS.date])
    shots.push({
      club,
      carryYds: carry,
      offlineYds: offline.value,
      curveYds: parseSigned(r[SS.curve])?.value ?? null,
      launchDirDeg: parseSigned(r[SS.launchDir])?.value ?? null,
      isPartial: false,
    })
  }
  return { shots, date, skipped, unknownClubs: {} }
}

// ---------- header-named tables ----------

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "")

const ALIASES: Record<keyof ColumnMapping, string[]> = {
  club: ["club", "clubtype", "clubname", "clubused", "clubtypename"],
  carry: ["carry", "carrydistance", "carrydist", "carryyards", "carryyds", "carrylength"],
  offline: ["offline", "side", "sidedistance", "lateral", "lateraldistance", "carryside", "carryoffline", "offlinedistance", "carrydeviationdistance", "deviationdistance", "totalside", "sideyds"],
  launchDir: ["launchdirection", "launchdir", "horizontallaunchangle", "hla", "azimuth", "startdirection", "startline", "launchhorizontal"],
  curve: ["curve", "curvedistance", "carrycurve", "curveyds", "sidecurve"],
  partial: ["partial", "ispartial", "partialswing"],
  date: ["date", "shotdate", "sessiondate", "timestamp", "datetime", "time"],
}

export function guessMapping(headers: string[]): ColumnMapping {
  const keys = headers.map(norm)
  const find = (field: keyof ColumnMapping) => keys.findIndex((k) => k !== "" && ALIASES[field].includes(k))
  return {
    club: find("club"),
    carry: find("carry"),
    offline: find("offline"),
    launchDir: find("launchDir"),
    curve: find("curve"),
    partial: find("partial"),
    date: find("date"),
  }
}

export function isCompleteMapping(m: ColumnMapping): boolean {
  return m.club >= 0 && m.carry >= 0 && (m.offline >= 0 || m.launchDir >= 0)
}

function unitFromHeader(header: string | undefined): "yd" | "m" | null {
  const h = (header ?? "").toLowerCase()
  if (/\((m|meters?|metres?)\)|\bmeters?\b|\bmetres?\b/.test(h)) return "m"
  if (/\((yds?|yards?)\)|\byards?\b/.test(h)) return "yd"
  return null
}

export function detectFormat(rows: string[][]): Detected {
  if (looksLikeSessionSummary(rows)) return { kind: "session-summary" }
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const mapping = guessMapping(rows[i])
    if (mapping.club >= 0 && mapping.carry >= 0) {
      return { kind: "table", headerRow: i, headers: rows[i], mapping, complete: isCompleteMapping(mapping), unitHint: unitFromHeader(rows[i][mapping.carry]) }
    }
  }
  // Unrecognised: the first row is the best guess at headers; the caller maps by hand.
  const headers = rows[0] ?? []
  return { kind: "table", headerRow: 0, headers, mapping: guessMapping(headers), complete: false, unitHint: null }
}

export function parseTable(rows: string[][], headerRow: number, m: ColumnMapping, settings: ImportSettings): ParseResult {
  const toYards = settings.distanceUnit === "m" ? YARDS_PER_METRE : 1
  const shots: ParsedShot[] = []
  const unknownClubs: Record<string, number> = {}
  let date: string | null = null
  let skipped = 0

  // A signed value: "3 L" wins over the file's sign convention; a bare number follows it.
  const signed = (cell: string | undefined): number | null => {
    const p = parseSigned(cell)
    if (!p) return null
    return p.hasSide || settings.leftIsNegative ? p.value : -p.value
  }

  for (const r of rows.slice(headerRow + 1)) {
    const rawClub = (r[m.club] ?? "").trim()
    if (!rawClub) continue
    const club = normalizeClubName(rawClub)
    if (!club) {
      const low = rawClub.toLowerCase()
      if (low !== "average" && low !== "avg") unknownClubs[rawClub] = (unknownClubs[rawClub] ?? 0) + 1
      continue
    }
    const carryRaw = plainNumber(r[m.carry])
    const carry = carryRaw == null ? null : carryRaw * toYards
    const launch = m.launchDir >= 0 ? signed(r[m.launchDir]) : null
    const offlineRaw = m.offline >= 0 ? signed(r[m.offline]) : null
    let offline = offlineRaw == null ? null : offlineRaw * toYards
    if (offline == null && launch != null && carry != null) offline = carry * Math.tan((launch * Math.PI) / 180)
    if (carry == null || offline == null || carry < MIN_CARRY_YDS || carry > MAX_CARRY_YDS) {
      skipped++
      continue
    }
    const curveRaw = m.curve >= 0 ? signed(r[m.curve]) : null
    if (m.date >= 0) date = date ?? toIsoDate(r[m.date])
    shots.push({
      club,
      carryYds: carry,
      offlineYds: offline,
      curveYds: curveRaw == null ? null : curveRaw * toYards,
      launchDirDeg: launch,
      isPartial: m.partial >= 0 && /^(true|1|yes|y|partial)$/i.test((r[m.partial] ?? "").trim()),
    })
  }
  return { shots, date, skipped, unknownClubs }
}

/** Parse whichever layout `detectFormat` found. */
export function parseDetected(rows: string[][], detected: Detected, mapping: ColumnMapping, settings: ImportSettings): ParseResult {
  return detected.kind === "session-summary" ? parseSessionSummary(rows) : parseTable(rows, detected.headerRow, mapping, settings)
}
