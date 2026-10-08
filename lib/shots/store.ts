// Saving, deleting and re-fitting a golfer's shot data. Every change ends in
// refit(): the profile always matches the shots that are saved, and the
// session weights are recomputed against today.
//
// The logic talks to a small ShotDb so it can be tested without a database;
// supabaseShotDb() is the real one. Row-level security (supabase/shot_data_13c.sql)
// is what keeps each account to its own rows -- the user_id sent here is only
// the owner stamp, the database checks it.

import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeClubName } from "@/lib/golfer/clubNames"
import { fitProfiles, fitToRow, type ClubFit, type ProfileRow } from "@/lib/golfer/shotProfile"
import { withIndoorDefault } from "./temperature"
import type { NewSession, ParsedShot, SessionMeta, StoredShot } from "./types"

export type SessionPatch = Partial<Pick<SessionMeta, "label" | "date" | "environment" | "surface" | "excluded" | "temperatureF">>

export interface ShotDb {
  listSessions(): Promise<SessionMeta[]>
  listShots(): Promise<StoredShot[]>
  listProfileRows(): Promise<ProfileRow[]>
  replaceProfiles(rows: ProfileRow[]): Promise<void>
  insertSession(session: NewSession): Promise<string>
  insertShots(sessionId: string, session: NewSession, shots: ParsedShot[]): Promise<void>
  updateSession(id: string, patch: SessionPatch): Promise<void>
  deleteSession(id: string): Promise<void>
  deleteAll(): Promise<void>
}

/** Re-fits every club from the saved shots and stores the result. */
export async function refit(db: ShotDb, now: Date = new Date()): Promise<ClubFit[]> {
  const [sessions, shots] = await Promise.all([db.listSessions(), db.listShots()])
  const fits = fitProfiles(sessions, shots, now)
  await db.replaceProfiles(fits.map(fitToRow))
  return fits
}

export async function saveSession(db: ShotDb, newSession: NewSession, shots: ParsedShot[]): Promise<ClubFit[]> {
  if (shots.length === 0) throw new Error("There are no shots to save.")
  const session = withIndoorDefault(newSession)
  const id = await db.insertSession(session)
  try {
    await db.insertShots(id, session, shots)
  } catch (e) {
    await db.deleteSession(id).catch(() => undefined) // don't leave an empty session behind
    throw e
  }
  return refit(db)
}

export async function updateSession(db: ShotDb, id: string, patch: SessionPatch): Promise<ClubFit[]> {
  await db.updateSession(id, patch)
  return refit(db)
}

export async function deleteSession(db: ShotDb, id: string): Promise<ClubFit[]> {
  await db.deleteSession(id)
  return refit(db)
}

export async function deleteAllShotData(db: ShotDb): Promise<void> {
  await db.deleteAll()
  await db.replaceProfiles([])
}

/** Profiles older than this are re-fitted when the page opens, so the recency weights keep up with the calendar. */
export const REFIT_STALE_DAYS = 7

export function profilesAreStale(rows: ProfileRow[], hasShots: boolean, now: Date = new Date()): boolean {
  if (!hasShots) return false
  if (rows.length === 0) return true
  const oldest = Math.min(...rows.map((r) => (r.fitted_at ? Date.parse(r.fitted_at) : 0)))
  return now.getTime() - oldest > REFIT_STALE_DAYS * 86_400_000
}

// ---------- Supabase ----------

const PAGE = 1000
const INSERT_CHUNK = 500

function fail(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`)
}

export function supabaseShotDb(supabase: SupabaseClient, userId: string): ShotDb {
  return {
    async listSessions() {
      const { data, error } = await supabase
        .from("shot_sessions")
        .select("id, label, session_date, environment, surface, excluded, temperature_f")
        .order("session_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
      fail(error, "Couldn't load your sessions")
      return (data ?? []).map((r) => ({
        id: r.id as string,
        label: r.label as string,
        date: (r.session_date as string | null) ?? null,
        environment: r.environment as SessionMeta["environment"],
        surface: r.surface as SessionMeta["surface"],
        excluded: r.excluded as boolean,
        temperatureF: r.temperature_f == null ? null : Number(r.temperature_f),
      }))
    },

    async listShots() {
      const out: StoredShot[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("real_shots")
          .select("session_id, shot_date, club, carry_yds, offline_yds, curve_yds, launch_dir_deg, is_partial")
          .eq("user_id", userId)
          .order("id") // stable order, or paging can skip and repeat rows
          .range(from, from + PAGE - 1)
        fail(error, "Couldn't load your shots")
        for (const r of data ?? []) {
          const club = normalizeClubName(String(r.club)) // legacy rows say "56 (SW)"
          if (!club) continue
          out.push({
            sessionId: (r.session_id as string | null) ?? null,
            date: (r.shot_date as string | null) ?? null,
            club,
            carryYds: Number(r.carry_yds),
            offlineYds: Number(r.offline_yds),
            curveYds: r.curve_yds == null ? null : Number(r.curve_yds),
            launchDirDeg: r.launch_dir_deg == null ? null : Number(r.launch_dir_deg),
            isPartial: r.is_partial === true,
          })
        }
        if (!data || data.length < PAGE) break
      }
      return out
    },

    async listProfileRows() {
      const { data, error } = await supabase.from("shot_profiles").select("club, params, n_shots, sessions_used, fitted_at")
      fail(error, "Couldn't load your profile")
      return (data ?? []) as ProfileRow[]
    },

    async replaceProfiles(rows) {
      const clubs = rows.map((r) => r.club)
      let del = supabase.from("shot_profiles").delete().eq("user_id", userId)
      if (clubs.length > 0) del = del.not("club", "in", `(${clubs.map((c) => `"${c}"`).join(",")})`)
      fail((await del).error, "Couldn't clear old profiles")
      if (rows.length === 0) return
      const stamped = rows.map((r) => ({ user_id: userId, club: r.club, params: r.params, n_shots: r.n_shots, sessions_used: r.sessions_used, fitted_at: new Date().toISOString() }))
      fail((await supabase.from("shot_profiles").upsert(stamped, { onConflict: "user_id,club" })).error, "Couldn't save your profile")
    },

    async insertSession(s) {
      const { data, error } = await supabase
        .from("shot_sessions")
        .insert({ user_id: userId, label: s.label, session_date: s.date, environment: s.environment, surface: s.surface, temperature_f: s.temperatureF ?? null })
        .select("id")
        .single()
      fail(error, "Couldn't save the session")
      return data!.id as string
    },

    async insertShots(sessionId, s, shots) {
      const rows = shots.map((x) => ({
        user_id: userId,
        session_id: sessionId,
        session_label: s.label,
        shot_date: s.date,
        club: x.club,
        carry_yds: Math.round(x.carryYds * 10) / 10,
        offline_yds: Math.round(x.offlineYds * 100) / 100,
        curve_yds: x.curveYds == null ? null : Math.round(x.curveYds * 100) / 100,
        launch_dir_deg: x.launchDirDeg == null ? null : Math.round(x.launchDirDeg * 100) / 100,
        is_partial: x.isPartial,
      }))
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        fail((await supabase.from("real_shots").insert(rows.slice(i, i + INSERT_CHUNK))).error, "Couldn't save the shots")
      }
    },

    async updateSession(id, patch) {
      const row: Record<string, unknown> = {}
      if (patch.label !== undefined) row.label = patch.label
      if (patch.date !== undefined) row.session_date = patch.date
      if (patch.environment !== undefined) row.environment = patch.environment
      if (patch.surface !== undefined) row.surface = patch.surface
      if (patch.excluded !== undefined) row.excluded = patch.excluded
      if (patch.temperatureF !== undefined) row.temperature_f = patch.temperatureF
      fail((await supabase.from("shot_sessions").update(row).eq("id", id)).error, "Couldn't update the session")
    },

    async deleteSession(id) {
      fail((await supabase.from("shot_sessions").delete().eq("id", id)).error, "Couldn't delete the session")
    },

    async deleteAll() {
      // Shots first (legacy rows have no session), then the sessions themselves.
      fail((await supabase.from("real_shots").delete().eq("user_id", userId)).error, "Couldn't delete your shots")
      fail((await supabase.from("shot_sessions").delete().eq("user_id", userId)).error, "Couldn't delete your sessions")
    },
  }
}
