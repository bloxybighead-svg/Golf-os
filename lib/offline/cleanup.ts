// One-time-per-launch tidy of localStorage. Course map data used to be cached
// there too (golfos.course.<id>.v<N>, about 280 KB each, old versions never
// deleted); localStorage caps near 5 MB, so writes started failing silently.
// IndexedDB (lib/offline/snapshots.ts) is now the only course cache, so those
// keys are removed. Pure over a Storage-like object so it can be tested.

import { kvKeys } from "./db"

/** The minimal Storage surface used here (the real Storage and a test fake both fit). */
export interface KeyStore {
  readonly length: number
  key(i: number): string | null
  getItem(k: string): string | null
  removeItem(k: string): void
}

const OLD_COURSE_CACHE = /^golfos\.course\./
const ZONES = /^golfos\.zones\.(.+)\.v1$/
const ZOOM = /^golfos\.zoom\.(.+)\.v1$/

/**
 * Deletes every old golfos.course.* key. Also drops, for courses with no saved map data on this device
 * (`savedCourseIds`; pass null when that is unknown), the remembered zoom, and any hand-drawn zones entry that is
 * empty. Zones that hold drawings are NEVER deleted: for a guest that localStorage is the only copy of their work.
 * Every other golfos.* key is left alone. Returns the keys removed.
 */
export function cleanupLocalStorage(store: KeyStore, savedCourseIds: Set<string> | null): string[] {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k) keys.push(k)
  }
  const removed: string[] = []
  for (const k of keys) {
    let drop = OLD_COURSE_CACHE.test(k)
    if (!drop && savedCourseIds) {
      const zoom = ZOOM.exec(k)
      if (zoom && !savedCourseIds.has(zoom[1])) drop = true
      const zones = ZONES.exec(k)
      if (zones && !savedCourseIds.has(zones[1]) && isEmptyZones(store.getItem(k))) drop = true
    }
    if (drop) {
      store.removeItem(k)
      removed.push(k)
    }
  }
  return removed
}

function isEmptyZones(raw: string | null): boolean {
  if (raw == null) return true
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) && v.length === 0
  } catch {
    return false // unreadable: leave it, it might be recoverable
  }
}

/** Runs the cleanup on this browser's localStorage. Safe where storage or IndexedDB is blocked. */
export async function runStartupCleanup(): Promise<void> {
  try {
    const saved = (await kvKeys("course:")).map((k) => k.key.slice("course:".length))
    // With nothing saved (or IndexedDB unavailable) we can't tell which courses are gone: only the old cache keys go.
    cleanupLocalStorage(localStorage, saved.length > 0 ? new Set(saved) : null)
  } catch {
    /* storage blocked: nothing to clean */
  }
}
