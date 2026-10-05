// IndexedDB for offline play: saved copies of what the planner needs (kv) and
// the outbox of things waiting to reach Supabase. Every call is safe where
// IndexedDB is missing or blocked (server render, private mode): reads give
// null / [], writes do nothing, and callers keep working from localStorage.

import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { OutboxJob } from "./syncQueue"

interface OfflineDb extends DBSchema {
  kv: { key: string; value: { key: string; value: unknown; savedAt: number } }
  outbox: { key: string; value: OutboxJob }
}

const DB_NAME = "golfos-offline"
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<OfflineDb>> | null = null

function db(): Promise<IDBPDatabase<OfflineDb>> | null {
  if (typeof indexedDB === "undefined") return null
  dbPromise ??= openDB<OfflineDb>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      d.createObjectStore("kv", { keyPath: "key" })
      d.createObjectStore("outbox", { keyPath: "key" })
    },
  })
  return dbPromise
}

export async function kvGet<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  try {
    const row = await (await db())?.get("kv", key)
    return row ? { value: row.value as T, savedAt: row.savedAt } : null
  } catch {
    return null
  }
}

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  try {
    const d = await db()
    if (!d) return false
    await d.put("kv", { key, value, savedAt: Date.now() })
    return true
  } catch {
    return false // storage full or blocked: the copy just won't be there offline
  }
}

export async function kvKeys(prefix: string): Promise<{ key: string; savedAt: number }[]> {
  try {
    const rows = (await (await db())?.getAll("kv")) ?? []
    return rows.filter((r) => r.key.startsWith(prefix)).map((r) => ({ key: r.key, savedAt: r.savedAt }))
  } catch {
    return []
  }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    await (await db())?.delete("kv", key)
  } catch {
    /* nothing to do */
  }
}

/**
 * Forgets every saved copy (the kv store). The outbox is NOT cleared: a round
 * finished offline and not yet synced must survive a sign-out, and each job is
 * tied to its owner's account, so it waits for that golfer to sign in again.
 */
export async function clearOfflineStore(): Promise<void> {
  try {
    await (await db())?.clear("kv")
  } catch {
    /* nothing to do */
  }
}

// ---- outbox ----

export async function outboxRead(): Promise<OutboxJob[]> {
  try {
    return (await (await db())?.getAll("outbox")) ?? []
  } catch {
    return []
  }
}

/**
 * Read, change and write the whole outbox as one step, holding a lock across tabs
 * (Web Locks) so two open tabs cannot overwrite each other's change. null when
 * IndexedDB could not be used (nothing was changed).
 */
export async function outboxUpdate(change: (jobs: OutboxJob[]) => OutboxJob[]): Promise<OutboxJob[] | null> {
  const run = async (): Promise<OutboxJob[] | null> => {
    const d = await db()
    if (!d) return null
    const tx = d.transaction("outbox", "readwrite")
    const store = tx.objectStore("outbox")
    const next = change(await store.getAll())
    await store.clear()
    for (const j of next) await store.put(j)
    await tx.done
    return next
  }
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined
    return locks ? await locks.request("golfos-outbox", run) : await run()
  } catch {
    return null // IndexedDB unavailable or full: the caller must not assume the change was kept
  }
}
