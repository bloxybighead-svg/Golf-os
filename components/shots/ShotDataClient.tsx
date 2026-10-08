"use client"

// You > My bag > My shot data: what the golfer has uploaded, what the planner
// learned from it, and the controls to change either.

import { useEffect, useMemo, useRef, useState } from "react"
import { Target } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import { DispersionCanvas } from "@/components/simulator/DispersionCanvas"
import { makeFairwayPolygon } from "@/lib/dispersion/polygon"
import { createClient } from "@/lib/supabase/client"
import { badgeFor, fitFromRow, generateMyBag, summarizeClubs, type ProfileRow } from "@/lib/golfer/shotProfile"
import { DEFAULT_BLEND_HANDICAP } from "@/lib/supabase/loadMyProfile"
import { deleteAllShotData, deleteSession, profilesAreStale, refit, saveSession, supabaseShotDb, updateSession, type SessionPatch } from "@/lib/shots/store"
import { baselineFromSessions, INDOOR_TEMP_F, parseSessionTemperature, SESSION_TEMP_MAX_F, SESSION_TEMP_MIN_F } from "@/lib/shots/temperature"
import type { NewSession, ParsedShot, SessionMeta, StoredShot } from "@/lib/shots/types"
import { ImportFlow } from "./ImportFlow"
import { ManualEntry } from "./ManualEntry"
import { BadgePill, BUTTON, CARD, INPUT } from "./ui"

export interface ShotData {
  sessions: SessionMeta[]
  shots: StoredShot[]
  profileRows: ProfileRow[]
}

/** Width of the target shown in the preview, as the planner's misses page uses by default. */
const PREVIEW_TARGET_YDS = 30

function offlineLabel(v: number) {
  return v === 0 ? "0" : v > 0 ? `${v.toFixed(1)} R` : `${Math.abs(v).toFixed(1)} L`
}

export function ShotDataClient({ userId, initial }: { userId: string; initial: ShotData }) {
  const db = useMemo(() => supabaseShotDb(createClient(), userId), [userId])
  const [data, setData] = useState<ShotData>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [club, setClub] = useState<string>("")
  const [view, setView] = useState<"real" | "model">("real")

  async function reload() {
    const [sessions, shots, profileRows] = await Promise.all([db.listSessions(), db.listShots(), db.listProfileRows()])
    setData({ sessions, shots, profileRows })
  }

  /** Runs a change, then reloads everything it touched (the change re-fits the profile itself). */
  async function run(change: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await change()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      throw e
    } finally {
      setBusy(false)
    }
  }

  // Profiles missing or a week old are re-fitted on open, so the recency weights keep up with the calendar.
  const checked = useRef(false)
  useEffect(() => {
    if (checked.current) return
    checked.current = true
    if (profilesAreStale(initial.profileRows, initial.shots.length > 0)) run(() => refit(db)).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fits = useMemo(() => data.profileRows.flatMap((r) => fitFromRow(r) ?? []), [data.profileRows])
  const fitByClub = new Map(fits.map((f) => [f.club as string, f]))
  const summary = useMemo(() => summarizeClubs(data.sessions, data.shots), [data.sessions, data.shots])
  const usedSessions = data.sessions.filter((s) => !s.excluded)
  const baselineF = useMemo(() => baselineFromSessions(data.sessions, data.shots), [data.sessions, data.shots])
  const anyTemperature = usedSessions.some((s) => s.temperatureF != null)
  const selected = summary.find((s) => s.club === club) ?? summary[0]

  const countBySession = useMemo(() => {
    const m = new Map<string, { n: number; clubs: Set<string> }>()
    for (const s of data.shots) {
      if (!s.sessionId) continue
      const e = m.get(s.sessionId) ?? { n: 0, clubs: new Set<string>() }
      e.n++
      e.clubs.add(s.club)
      m.set(s.sessionId, e)
    }
    return m
  }, [data.shots])

  // Preview points: the real shots that count, or the model the planner samples.
  const preview = useMemo(() => {
    if (!selected) return null
    let pts: { carryYds: number; offlineYds: number }[]
    if (view === "real") {
      const excluded = new Set(data.sessions.filter((s) => s.excluded).map((s) => s.id))
      pts = data.shots.filter((s) => s.club === selected.club && !s.isPartial && !(s.sessionId && excluded.has(s.sessionId)))
    } else {
      const bag = generateMyBag(fits, [selected.club], DEFAULT_BLEND_HANDICAP, 500)
      pts = bag.clubs[0]?.shots ?? []
    }
    if (pts.length === 0) return null
    const carries = pts.map((p) => p.carryYds)
    const min = Math.min(...carries)
    const max = Math.max(...carries)
    const pad = Math.max((max - min) * 0.15, selected.meanCarry * 0.03)
    const maxCarry = max + pad
    const endWidth = PREVIEW_TARGET_YDS * 1.4
    return {
      pts,
      minCarry: Math.max(0, min - pad),
      maxCarry,
      widthYds: Math.max(endWidth + 20, Math.max(...pts.map((p) => Math.abs(p.offlineYds))) * 2.3),
      fairway: makeFairwayPolygon({ startYds: 0, endYds: maxCarry, startWidthYds: PREVIEW_TARGET_YDS, endWidthYds: endWidth }),
    }
  }, [selected, view, data.shots, data.sessions, fits])

  const save = (session: NewSession, shots: ParsedShot[]) => run(() => saveSession(db, session, shots))
  const patch = (id: string, p: SessionPatch) => run(() => updateSession(db, id, p)).catch(() => undefined)

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Target}
        title="My shot data"
        subtitle="Real shots you upload or type in. The planner learns your carry, your miss and your curve from them."
      />
      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <ImportFlow busy={busy} onSave={save} />
        <ManualEntry busy={busy} onSave={save} />
      </div>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-fg">Your clubs</h2>
        {summary.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No shots yet. Upload a file or type some in above, and each club shows up here with how far to trust it.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              Solid = enough shots for the average carry to be within about 2 yd (35 for an iron, 70 for a wood, 140 for the driver). OK = 15 or more. Thin = under 15: the
              planner blends that club with a handicap estimate and marks it &ldquo;est.&rdquo;. Under 5 shots, a club is estimated entirely.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted">
                    {["Club", "Shots", "Avg carry", "Carry SD", "Start-line bias", "Offline SD", "Trust"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1 font-medium first:pl-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => {
                    const fit = fitByClub.get(s.club)
                    return (
                      <tr
                        key={s.club}
                        onClick={() => setClub(s.club)}
                        className={`cursor-pointer border-t border-fg/[0.04] text-fg-2 hover:bg-fg/[0.03] ${selected?.club === s.club ? "bg-accent/10" : ""}`}
                      >
                        <td className="whitespace-nowrap py-1.5 pl-0 pr-2 font-semibold text-fg">{s.club}</td>
                        <td className="px-2 tabular-nums">{s.n}</td>
                        <td className="px-2 tabular-nums">{s.meanCarry.toFixed(0)} yd</td>
                        <td className="px-2 tabular-nums">{s.carrySd.toFixed(1)}</td>
                        <td className="px-2 tabular-nums">{s.startLineBias == null ? "–" : `${s.startLineBias >= 0 ? "+" : ""}${s.startLineBias.toFixed(1)}°`}</td>
                        <td className="px-2 tabular-nums">{s.offlineSd.toFixed(1)} yd</td>
                        <td className="whitespace-nowrap px-2">
                          <BadgePill badge={badgeFor(s.club, s.n)} />
                          {fit?.matIndoorOnly && (
                            <span className="ml-2 text-[11px] text-muted" title="No outdoor-grass shots for this club, so it is fitted only from mat or indoor data">
                              mat/indoor only
                            </span>
                          )}
                          {!fit && <span className="ml-2 text-[11px] text-muted">not fitted (under 5)</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {selected && (
        <section className={CARD}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-fg">{selected.club} dispersion</h2>
              <p className="mt-1 text-xs text-muted">Offline is yards left or right of the target line, carry is how far it flew. Tap a club above to change.</p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Show</span>
              <select className={INPUT} value={view} onChange={(e) => setView(e.target.value as "real" | "model")}>
                <option value="real">Your real shots</option>
                <option value="model" disabled={!fitByClub.has(selected.club)}>
                  The model the planner uses
                </option>
              </select>
            </label>
          </div>
          <div className="mt-3">
            {preview ? (
              <DispersionCanvas shots={preview.pts} fairway={preview.fairway} minCarryYds={preview.minCarry} maxCarryYds={preview.maxCarry} widthYds={preview.widthYds} />
            ) : (
              <p className="text-sm text-muted">Nothing to show for this club.</p>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Average miss {offlineLabel(preview ? preview.pts.reduce((a, p) => a + p.offlineYds, 0) / preview.pts.length : 0)} yd, {preview?.pts.length ?? 0} shots shown.</p>
        </section>
      )}

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-fg">Sessions ({data.sessions.length})</h2>
        {data.sessions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None yet.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              Newer sessions count for more (a session&rsquo;s weight halves every 90 days). Outdoor-grass shots count for more than mat or indoor ones when a club has both. Untick a
              session to leave it out; delete to remove it. Every change re-fits your profile.
            </p>
            <ul className="mt-3 divide-y divide-fg/[0.04]">
              {data.sessions.map((s) => {
                const c = countBySession.get(s.id)
                return (
                  <li key={s.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${s.excluded ? "opacity-60" : ""}`}>
                    <label className="flex items-center gap-2" title="Include this session in the fit">
                      <input type="checkbox" checked={!s.excluded} disabled={busy} onChange={(e) => patch(s.id, { excluded: !e.target.checked })} />
                    </label>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{s.label}</p>
                      <p className="text-xs text-muted">
                        {s.date ?? "no date"} · {c?.n ?? 0} shots · {c ? Array.from(c.clubs).join(", ") : "no clubs"}
                      </p>
                    </div>
                    <select className={`${INPUT} w-28`} value={s.environment} disabled={busy} onChange={(e) => {
                        const environment = e.target.value as SessionMeta["environment"]
                        patch(s.id, environment === "indoor" && s.temperatureF == null ? { environment, temperatureF: INDOOR_TEMP_F } : { environment })
                      }} aria-label="Indoor or outdoor">
                      <option value="outdoor">Outdoor</option>
                      <option value="indoor">Indoor</option>
                    </select>
                    <select className={`${INPUT} w-24`} value={s.surface} disabled={busy} onChange={(e) => patch(s.id, { surface: e.target.value as SessionMeta["surface"] })} aria-label="Mat or grass">
                      <option value="grass">Grass</option>
                      <option value="mat">Mat</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input
                        key={`${s.id}-${s.temperatureF ?? ""}`}
                        className={`${INPUT} w-20`}
                        type="number"
                        inputMode="decimal"
                        min={SESSION_TEMP_MIN_F}
                        max={SESSION_TEMP_MAX_F}
                        defaultValue={s.temperatureF ?? ""}
                        placeholder="°F"
                        disabled={busy}
                        aria-label="Temperature in degrees Fahrenheit"
                        onBlur={(e) => {
                          const t = parseSessionTemperature(e.target.value)
                          if (t !== (s.temperatureF ?? null)) patch(s.id, { temperatureF: t })
                        }}
                      />
                      °F
                    </label>
                    <button
                      type="button"
                      className={`${BUTTON} text-danger`}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Delete "${s.label}" and its ${c?.n ?? 0} shots?`)) run(() => deleteSession(db, s.id)).catch(() => undefined)
                      }}
                    >
                      Delete
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">{usedSessions.length} of {data.sessions.length} sessions are in your profile.</p>
            <p className="mt-1 text-xs text-muted">
              {anyTemperature
                ? `Your carries were measured at about ${Math.round(baselineF)}°F (the average of your sessions with a temperature, by shot count). The planner adds or takes off yards when the day is warmer or colder than that.`
                : "Add a temperature to a session (indoor sessions count as 70°F) and the planner adjusts for a warmer or colder day. Until then it assumes 70°F."}
            </p>
          </>
        )}
      </section>

      {(data.sessions.length > 0 || data.shots.length > 0) && (
        <section className={CARD}>
          <h2 className="text-sm font-semibold text-fg">Delete everything</h2>
          <p className="mt-1 text-xs text-muted">Removes every session, shot and fitted profile you have saved. The planner goes back to a handicap estimate. This can&rsquo;t be undone.</p>
          <button
            type="button"
            className={`${BUTTON} mt-3 text-danger`}
            disabled={busy}
            onClick={() => {
              if (window.confirm("Delete ALL of your shot data? This can't be undone.")) run(() => deleteAllShotData(db)).catch(() => undefined)
            }}
          >
            Delete all my shot data
          </button>
        </section>
      )}
    </div>
  )
}
