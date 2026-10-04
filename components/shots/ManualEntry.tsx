"use client"

// For golfers without a launch monitor: type in club, carry and how far left or
// right each shot finished. No start line or curve, so those clubs are fitted
// the way calibrate.py fits a file with only offline yards.

import { useState } from "react"
import { BAG_ORDER, type Club } from "@/lib/golfer/tables"
import type { NewSession, ParsedShot } from "@/lib/shots/types"
import { BUTTON, BUTTON_PRIMARY, CARD, INPUT, SessionFields, todayIso } from "./ui"

/** Typed carries outside this are slips of the finger, not shots. */
const MIN_CARRY = 5
const MAX_CARRY = 450
/** Offline beyond this many yards is almost certainly a typo. */
const MAX_OFFLINE = 150

export function ManualEntry({ busy, onSave }: { busy: boolean; onSave: (session: NewSession, shots: ParsedShot[]) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<NewSession>({ label: "", date: todayIso(), environment: "outdoor", surface: "grass" })
  const [club, setClub] = useState<Club>("7-Iron")
  const [carry, setCarry] = useState("")
  const [offline, setOffline] = useState("")
  const [shots, setShots] = useState<ParsedShot[]>([])
  const [error, setError] = useState("")

  function add(e: React.FormEvent) {
    e.preventDefault()
    const c = Number(carry)
    const o = offline.trim() === "" ? 0 : Number(offline)
    if (!Number.isFinite(c) || c < MIN_CARRY || c > MAX_CARRY) return setError(`Carry should be ${MIN_CARRY}-${MAX_CARRY} yards.`)
    if (!Number.isFinite(o) || Math.abs(o) > MAX_OFFLINE) return setError(`Offline should be within ${MAX_OFFLINE} yards either side.`)
    setError("")
    setShots([...shots, { club, carryYds: c, offlineYds: o, curveYds: null, launchDirDeg: null, isPartial: false }])
    setCarry("")
    setOffline("")
  }

  async function save() {
    try {
      setError("")
      await onSave({ ...meta, label: meta.label.trim() }, shots)
      setShots([])
      setMeta({ label: "", date: todayIso(), environment: "outdoor", surface: "grass" })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.")
    }
  }

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Type in shots</h2>
          <p className="mt-1 text-xs text-muted">No launch monitor? Club, carry, and how far left or right it finished.</p>
        </div>
        {!open && (
          <button type="button" className={BUTTON} onClick={() => setOpen(true)}>
            Start
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <SessionFields value={meta} onChange={setMeta} />
          <form onSubmit={add} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Club</span>
              <select className={INPUT} value={club} onChange={(e) => setClub(e.target.value as Club)}>
                {BAG_ORDER.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Carry (yd)</span>
              <input className={`${INPUT} w-24`} inputMode="decimal" value={carry} onChange={(e) => setCarry(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Offline (yd, + right / − left)</span>
              <input className={`${INPUT} w-32`} inputMode="decimal" value={offline} onChange={(e) => setOffline(e.target.value)} placeholder="0" />
            </label>
            <button type="submit" className={BUTTON_PRIMARY}>
              Add shot
            </button>
          </form>

          {shots.length > 0 && (
            <ul className="max-h-48 divide-y divide-fg/[0.04] overflow-y-auto rounded-lg border border-fg/[0.06] text-xs text-fg-2">
              {shots.map((s, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="w-16 text-fg">{s.club}</span>
                  <span className="tabular-nums">{s.carryYds} yd</span>
                  <span className="tabular-nums text-muted">{s.offlineYds >= 0 ? `${s.offlineYds} R` : `${Math.abs(s.offlineYds)} L`}</span>
                  <button type="button" className="ml-auto text-muted hover:text-danger" onClick={() => setShots(shots.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className={BUTTON_PRIMARY} disabled={busy || shots.length === 0 || meta.label.trim() === ""} onClick={save}>
              {busy ? "Saving…" : `Save ${shots.length} shots`}
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                setShots([])
                setOpen(false)
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
