// The golfer's bag as this device's Play settings hold it (the same keys the
// planner reads and writes), for the You hub and My bag. Pure parsing is split
// from the localStorage read so it can be tested.

import { CALIBRATED_DEFAULT_BAG, DEFAULT_BAG, normalizeBag } from "@/lib/golfer/bag"
import { LAST_POSITION_KEY, SETTINGS_KEY, cleanCarries, type CourseRef } from "@/lib/golfer/baseline"
import type { Club } from "@/lib/golfer/tables"

/** "calibrated" is the golfer's own shots (My shot data); "legacy" the old public data; "handicap" an estimate. */
export type ShotSource = "calibrated" | "handicap" | "legacy"

/** Keep in step with SOURCE_VERSION in hooks/usePlannerSettings.ts: a saved source from an older version is ignored there, so it is here. */
const PLANNER_SOURCE_VERSION = 2

export interface DeviceBag {
  source: ShotSource
  bag: Club[]
  /** Carries the golfer typed in setup, by club. */
  carries: Partial<Record<Club, number>>
  handicap: number | null
  /** The course Play last opened, which setup sets to the home course. */
  course: CourseRef | null
}

/**
 * `defaultSource` is what Play uses when the device never chose one: the
 * golfer's own shots if they have a profile, otherwise handicap-based.
 * `fittedClubs` are the clubs they have data for, which join the default bag.
 */
export function parseDeviceBag(
  rawSettings: string | null,
  rawLast: string | null,
  defaultSource: "calibrated" | "handicap",
  fittedClubs: readonly Club[] = []
): DeviceBag {
  let s: Record<string, unknown> = {}
  let last: { course?: CourseRef } | null = null
  try {
    s = JSON.parse(rawSettings ?? "{}") ?? {}
  } catch {
    /* unreadable: fall back to defaults */
  }
  try {
    last = JSON.parse(rawLast ?? "null")
  } catch {
    /* ignore */
  }

  const saved = s.source === "calibrated" || s.source === "handicap" || s.source === "legacy"
  const source: ShotSource = saved && s.sourceV === PLANNER_SOURCE_VERSION ? (s.source as ShotSource) : defaultSource
  const bags = (s.bags ?? {}) as Record<string, unknown>
  const stored = Array.isArray(bags[source]) ? normalizeBag(bags[source] as string[]) : []
  const fallback =
    source === "legacy" ? CALIBRATED_DEFAULT_BAG : source === "calibrated" ? normalizeBag([...DEFAULT_BAG, ...fittedClubs]) : DEFAULT_BAG
  const bag = stored.length ? stored : fallback

  const carries = cleanCarries((s.carries ?? {}) as Record<string, unknown>)
  const driver = Number(s.driverCarry)
  const seven = Number(s.sevenIronCarry)
  const withMain = cleanCarries({ ...carries, Driver: driver || undefined, "7-Iron": seven || undefined })
  const course = last?.course && typeof last.course.id === "string" && typeof last.course.name === "string" ? last.course : null

  return {
    source,
    bag,
    carries: { ...carries, ...withMain },
    handicap: typeof s.handicap === "number" ? s.handicap : null,
    course,
  }
}

export function readDeviceBag(defaultSource: "calibrated" | "handicap" = "handicap", fittedClubs: readonly Club[] = []): DeviceBag {
  try {
    return parseDeviceBag(localStorage.getItem(SETTINGS_KEY), localStorage.getItem(LAST_POSITION_KEY), defaultSource, fittedClubs)
  } catch {
    return parseDeviceBag(null, null, defaultSource, fittedClubs)
  }
}
