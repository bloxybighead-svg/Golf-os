// Keeping the Play planner's golfer settings (bag, carries, handicap, tendency,
// shot source) in step between this device and the golfer's account. A signed-in
// golfer's golfer_baseline row is the source of truth; the device copy is an
// offline backup. When both changed, the newer one wins.

import { normalizeBag } from "./bag"
import { cleanCarries, cleanHandicap } from "./baseline"
import type { Tendency } from "./build"
import type { Club } from "./tables"

/** How long after the last bag or settings edit before it is saved to the account. Estimate: long enough that tapping through several clubs sends one save. */
export const BAG_SYNC_DEBOUNCE_MS = 1500
/** localStorage key for when the device copy last changed (ms since epoch, or the server's updated_at once synced). */
export const SETTINGS_STAMP_KEY = "golfos.planner.updatedAt.v1"

const SIDES = ["auto", "straight", "left", "right", "both"]
const STRENGTHS = ["slight", "moderate", "strong"]

/** The planner's saved settings (the shape kept in localStorage under SETTINGS_KEY). */
export interface SyncedSettings {
  source: "calibrated" | "handicap"
  handicap: number
  driverCarry: string
  sevenIronCarry: string
  carries: Partial<Record<Club, number>>
  tendency: Tendency
  bags: { calibrated: Club[]; handicap: Club[] }
}

/** The golfer_baseline columns that carry these settings. */
export interface SettingsRow {
  handicap_index?: number | string | null
  carries?: unknown
  source?: unknown
  tendency?: unknown
  bag?: unknown
  updated_at?: string | null
}

/** What the account holds: any field may be missing (older rows predate the bag columns). */
export type RemoteSettings = Partial<SyncedSettings>

/** The account's settings from a row; fields the row does not have are left out. */
export function settingsFromRow(row: SettingsRow): RemoteSettings {
  const out: RemoteSettings = {}
  const hcp = cleanHandicap(row.handicap_index)
  if (hcp != null) out.handicap = Math.min(36, Math.max(0, hcp))
  if (row.carries && typeof row.carries === "object") {
    const all = cleanCarries(row.carries as Record<string, unknown>)
    const { Driver, "7-Iron": seven, ...others } = all
    out.driverCarry = Driver != null ? String(Driver) : ""
    out.sevenIronCarry = seven != null ? String(seven) : ""
    out.carries = others
  }
  if (row.source === "calibrated" || row.source === "handicap") out.source = row.source
  const t = row.tendency as Tendency | null | undefined
  if (t && SIDES.includes(t.side) && STRENGTHS.includes(t.strength)) out.tendency = { side: t.side, strength: t.strength }
  const bag = row.bag as { calibrated?: unknown; handicap?: unknown } | null | undefined
  if (bag && typeof bag === "object") {
    const cal = Array.isArray(bag.calibrated) ? normalizeBag(bag.calibrated as string[]) : []
    const hcp2 = Array.isArray(bag.handicap) ? normalizeBag(bag.handicap as string[]) : []
    if (cal.length && hcp2.length) out.bags = { calibrated: cal, handicap: hcp2 }
  }
  return out
}

/** Settings as golfer_baseline columns (cleaned, ready to write). */
export function settingsToRow(s: SyncedSettings): Required<Omit<SettingsRow, "updated_at">> {
  const carries: Record<string, number> = { ...cleanCarries(s.carries as Record<string, unknown>) }
  const driver = Number(s.driverCarry)
  const seven = Number(s.sevenIronCarry)
  Object.assign(carries, cleanCarries({ Driver: driver || undefined, "7-Iron": seven || undefined }))
  return {
    handicap_index: cleanHandicap(s.handicap),
    carries,
    source: s.source,
    tendency: s.tendency,
    bag: { calibrated: normalizeBag(s.bags.calibrated), handicap: normalizeBag(s.bags.handicap) },
  }
}

export type SyncDecision = "use-remote" | "push-local" | "in-sync"

/**
 * Who is newer. `localAt` is when the device copy last changed (0 or null when
 * it never has, e.g. a fresh phone); `remoteAt` is the account row's updated_at.
 * Newest wins; a tie, or neither side ever changed, is in sync. A fresh device
 * (no local change) always takes the account's settings.
 */
export function decideSync(localAt: number | null, remoteAt: number | null): SyncDecision {
  const l = localAt ?? 0
  const r = remoteAt ?? 0
  if (l > r) return "push-local"
  if (r > l) return "use-remote"
  return "in-sync"
}

/** The account's updated_at as ms, or null if missing or unreadable. */
export function stampMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/** `local` with the account's fields laid over it (fields the account lacks keep their device values). */
export function mergeRemote(local: SyncedSettings, remote: RemoteSettings): SyncedSettings {
  return { ...local, ...Object.fromEntries(Object.entries(remote).filter(([, v]) => v !== undefined)) } as SyncedSettings
}
