import { describe, expect, it } from "vitest"
import type { ProfileRow } from "@/lib/golfer/shotProfile"
import { deleteAllShotData, deleteSession, profilesAreStale, refit, REFIT_STALE_DAYS, saveSession, updateSession, type ShotDb } from "./store"
import type { NewSession, ParsedShot, SessionMeta, StoredShot } from "./types"

/** An in-memory ShotDb: what the real one does, minus the network. */
function memoryDb() {
  const sessions: SessionMeta[] = []
  let shots: StoredShot[] = []
  let profiles: ProfileRow[] = []
  let n = 0
  const db: ShotDb & { state: () => { sessions: SessionMeta[]; shots: StoredShot[]; profiles: ProfileRow[] } } = {
    state: () => ({ sessions, shots, profiles }),
    listSessions: async () => sessions.map((s) => ({ ...s })),
    listShots: async () => shots.map((s) => ({ ...s })),
    listProfileRows: async () => profiles,
    replaceProfiles: async (rows) => {
      profiles = rows
    },
    insertSession: async (s) => {
      const id = `s${++n}`
      sessions.push({ id, ...s, excluded: false })
      return id
    },
    insertShots: async (id, _s, list) => {
      shots.push(...list.map((x) => ({ ...x, sessionId: id })))
    },
    updateSession: async (id, patch) => {
      Object.assign(sessions.find((s) => s.id === id)!, patch)
    },
    deleteSession: async (id) => {
      sessions.splice(sessions.findIndex((s) => s.id === id), 1)
      shots = shots.filter((s) => s.sessionId !== id)
    },
    deleteAll: async () => {
      sessions.length = 0
      shots = []
    },
  }
  return db
}

const meta = (label: string): NewSession => ({ label, date: "2026-10-01", environment: "outdoor", surface: "grass" })
const swings = (club: ParsedShot["club"], n: number, carry: number): ParsedShot[] =>
  Array.from({ length: n }, (_, i) => ({ club, carryYds: carry + (i % 5), offlineYds: (i % 3) - 1, curveYds: null, launchDirDeg: null, isPartial: false }))

describe("re-fit on every change", () => {
  it("fits after an upload", async () => {
    const db = memoryDb()
    const fits = await saveSession(db, meta("a"), swings("7-Iron", 10, 150))
    expect(fits.map((f) => f.club)).toEqual(["7-Iron"])
    expect(db.state().profiles).toHaveLength(1)
    expect(db.state().profiles[0].n_shots).toBe(10)
  })

  it("re-fits when a session is deleted, and drops a club that no longer has enough shots", async () => {
    const db = memoryDb()
    await saveSession(db, meta("a"), swings("7-Iron", 10, 150))
    await saveSession(db, meta("b"), swings("PW", 8, 120))
    expect(db.state().profiles.map((p) => p.club).sort()).toEqual(["7-Iron", "PW"])
    await deleteSession(db, "s2")
    expect(db.state().profiles.map((p) => p.club)).toEqual(["7-Iron"])
  })

  it("re-fits when a session is excluded or brought back", async () => {
    const db = memoryDb()
    await saveSession(db, meta("a"), swings("7-Iron", 10, 150))
    await saveSession(db, meta("b"), swings("7-Iron", 10, 170))
    const both = db.state().profiles[0].params.mean_carry
    await updateSession(db, "s2", { excluded: true })
    expect(db.state().profiles[0].n_shots).toBe(10)
    expect(db.state().profiles[0].params.mean_carry).toBeLessThan(both)
    await updateSession(db, "s2", { excluded: false })
    expect(db.state().profiles[0].n_shots).toBe(20)
  })

  it("re-fits when a session's conditions change (mat down-weights against grass)", async () => {
    const db = memoryDb()
    await saveSession(db, meta("grass"), swings("7-Iron", 10, 150))
    await saveSession(db, meta("mat"), swings("7-Iron", 10, 170))
    const before = db.state().profiles[0].params.mean_carry
    await updateSession(db, "s2", { environment: "indoor", surface: "mat" })
    expect(db.state().profiles[0].params.mean_carry).toBeLessThan(before)
    expect(db.state().profiles[0].params.mat_indoor_only).toBe(false)
  })

  it("deleting everything leaves no shots, sessions or profiles", async () => {
    const db = memoryDb()
    await saveSession(db, meta("a"), swings("7-Iron", 10, 150))
    await deleteAllShotData(db)
    expect(db.state()).toEqual({ sessions: [], shots: [], profiles: [] })
  })

  it("refuses to save an empty session, and removes the session if the shots fail to save", async () => {
    const db = memoryDb()
    await expect(saveSession(db, meta("a"), [])).rejects.toThrow(/no shots/)
    db.insertShots = async () => {
      throw new Error("network")
    }
    await expect(saveSession(db, meta("a"), swings("7-Iron", 6, 150))).rejects.toThrow("network")
    expect(db.state().sessions).toHaveLength(0)
  })

  it("weights the saved sessions against the date it is fitted on", async () => {
    const db = memoryDb()
    await saveSession(db, { ...meta("old"), date: "2025-01-01" }, swings("7-Iron", 10, 150))
    await saveSession(db, { ...meta("new"), date: "2026-10-01" }, swings("7-Iron", 10, 170))
    const soon = await refit(db, new Date("2026-10-02T00:00:00Z"))
    expect(soon[0].profile.mean_carry).toBeGreaterThan(168) // the 21-month-old session barely counts
  })
})

describe("staleness", () => {
  const rows = (fittedAt: string): ProfileRow[] => [{ club: "7-Iron", params: {} as never, n_shots: 10, sessions_used: 1, fitted_at: fittedAt }]
  const now = new Date("2026-10-10T00:00:00Z")
  it("re-fits when there are shots but no profile, or an old one", () => {
    expect(profilesAreStale([], true, now)).toBe(true)
    expect(profilesAreStale([], false, now)).toBe(false)
    expect(profilesAreStale(rows("2026-10-09T00:00:00Z"), true, now)).toBe(false)
    expect(profilesAreStale(rows(new Date(now.getTime() - (REFIT_STALE_DAYS + 1) * 86_400_000).toISOString()), true, now)).toBe(true)
  })
})
