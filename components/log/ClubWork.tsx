"use client"

import { CLUB_WORK_CLUBS, FEEL_LABELS, type ClubWorkEntry } from "@/lib/supabase/types"

interface Props {
  entries: ClubWorkEntry[]
  onChange: (entries: ClubWorkEntry[]) => void
}

const numInput =
  "w-full rounded-md border border-line bg-surface-4 px-2.5 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none transition-colors"

function emptyEntry(): ClubWorkEntry {
  return { club: CLUB_WORK_CLUBS[0], feel: null, shots: null, avg_carry: null, dispersion: null, offline_var: null, spin_var: null, notes: null }
}

function numVal(v: string): number | null {
  return v === "" ? null : Number(v)
}

export function ClubWork({ entries, onChange }: Props) {
  const update = (i: number, patch: Partial<ClubWorkEntry>) =>
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i))
  const add = () => onChange([...entries, emptyEntry()])

  return (
    <div className="space-y-3">
      {entries.map((e, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <select
                value={e.club}
                onChange={(ev) => update(i, { club: ev.target.value })}
                className="rounded-md border border-line bg-surface-4 px-2.5 py-2 text-sm font-medium text-fg focus:border-accent focus:outline-none"
              >
                {CLUB_WORK_CLUBS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={e.feel ?? ""}
                onChange={(ev) => update(i, { feel: ev.target.value || null })}
                className={[
                  "rounded-md border border-line bg-surface-4 px-2.5 py-2 text-sm focus:border-accent focus:outline-none",
                  e.feel ? "font-medium text-fg" : "text-muted",
                ].join(" ")}
              >
                <option value="">Feel (optional)</option>
                {FEEL_LABELS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => remove(i)}
              className="text-xs text-muted hover:text-danger transition-colors"
            >
              remove
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Shots</span>
              <input type="number" inputMode="numeric" min={0} placeholder="e.g. 20"
                value={e.shots ?? ""} onChange={(ev) => update(i, { shots: numVal(ev.target.value) })} className={numInput} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Avg Carry</span>
              <input type="number" inputMode="numeric" min={0} placeholder="yds"
                value={e.avg_carry ?? ""} onChange={(ev) => update(i, { avg_carry: numVal(ev.target.value) })} className={numInput} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Carry ±</span>
              <input type="number" inputMode="numeric" min={0} placeholder="yds"
                value={e.dispersion ?? ""} onChange={(ev) => update(i, { dispersion: numVal(ev.target.value) })} className={numInput} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Offline ±</span>
              <input type="number" inputMode="numeric" min={0} placeholder="yds"
                value={e.offline_var ?? ""} onChange={(ev) => update(i, { offline_var: numVal(ev.target.value) })} className={numInput} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Spin ±</span>
              <input type="number" inputMode="numeric" placeholder="rpm"
                value={e.spin_var ?? ""} onChange={(ev) => update(i, { spin_var: numVal(ev.target.value) })} className={numInput} />
            </label>
          </div>

          <input
            type="text"
            placeholder="Notes (e.g. into the wind, off tight lies)"
            value={e.notes ?? ""}
            onChange={(ev) => update(i, { notes: ev.target.value || null })}
            className="mt-2 w-full rounded-md border border-line bg-surface-4 px-2.5 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
        </div>
      ))}

      <button
        onClick={add}
        className="w-full rounded-md border border-dashed border-line py-2.5 text-sm text-muted transition-colors hover:border-fg hover:text-fg"
      >
        + Add Entry
      </button>
      <p className="text-xs text-faint">
        Hit multiple feels with the same club? Add a separate entry per feel — that keeps the
        Wedge Numbers averages clean.
      </p>
    </div>
  )
}
