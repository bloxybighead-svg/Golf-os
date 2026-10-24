// The two golfer settings strokes gained and shot tracking read: "Track every
// shot" (off by default) and the level strokes gained is measured against.
// Set on You -> Settings, saved per device, same pattern as spreadSetting.

import { getBaseline, type Baseline } from "@/lib/course/baseline"
import { cleanHandicap } from "@/lib/golfer/baseline"

export const TRACK_SHOTS_KEY = "golfos.trackShots.v1"
export const SG_COMPARE_KEY = "golfos.sgCompare.v1"
/** Fired on window when either value changes in this tab (the storage event only reaches other tabs). */
export const SG_SETTINGS_EVENT = "golfos:sg-settings"

/** Scratch (default), the golfer's own handicap, or a handicap they typed. */
export type SgCompare = { kind: "scratch" } | { kind: "handicap" } | { kind: "typed"; handicap: number }

export const SCRATCH: SgCompare = { kind: "scratch" }

/** The saved text for a choice: "scratch", "handicap", or the typed handicap. */
export function compareToText(c: SgCompare): string {
  return c.kind === "typed" ? String(c.handicap) : c.kind
}

/** Anything unusable becomes scratch. */
export function compareFromText(raw: unknown): SgCompare {
  if (raw === "handicap") return { kind: "handicap" }
  if (raw == null || raw === "" || raw === "scratch") return SCRATCH
  const h = cleanHandicap(raw)
  return h == null ? SCRATCH : { kind: "typed", handicap: h }
}

/** The baseline to measure against and how to say it. "Your handicap" with no handicap known reads as scratch. */
export function baselineFor(c: SgCompare, ownHandicap: number | null): { baseline: Baseline; label: string } {
  if (c.kind === "typed") return { baseline: getBaseline(c.handicap), label: `a ${c.handicap.toFixed(1)} handicap` }
  if (c.kind === "handicap" && ownHandicap != null) return { baseline: getBaseline(ownHandicap), label: `your ${ownHandicap.toFixed(1)} handicap` }
  return { baseline: getBaseline(0), label: "scratch" }
}

function announce() {
  try {
    window.dispatchEvent(new Event(SG_SETTINGS_EVENT))
  } catch {
    // no window (tests)
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode etc.: the choice just won't stick
  }
  announce()
}

export const readTrackShots = (): boolean => read(TRACK_SHOTS_KEY) === "1"
export const saveTrackShots = (on: boolean) => write(TRACK_SHOTS_KEY, on ? "1" : "0")

export const readSgCompare = (): SgCompare => compareFromText(read(SG_COMPARE_KEY))
export const saveSgCompare = (c: SgCompare) => write(SG_COMPARE_KEY, compareToText(c))
