"use client"

import type { Badge } from "@/lib/golfer/shotProfile"
import type { NewSession } from "@/lib/shots/types"

export const INPUT = "h-11 rounded-lg border border-fg/[0.08] bg-page px-3 text-sm text-fg md:h-9"
export const BUTTON = "h-11 rounded-lg border border-fg/[0.08] px-4 text-sm font-semibold text-fg-2 hover:border-fg/20 hover:text-fg disabled:opacity-50 md:h-9"
export const BUTTON_PRIMARY = "h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50 md:h-9"
export const CARD = "rounded-xl border border-fg/[0.06] bg-surface p-4"

const BADGE_STYLE: Record<Badge, { label: string; cls: string; hint: string }> = {
  solid: { label: "Solid", cls: "bg-accent/15 text-accent", hint: "Enough shots for the mean carry to be within about 2 yd" },
  ok: { label: "OK", cls: "bg-info/15 text-info", hint: "15 or more shots: usable, still firming up" },
  thin: { label: "Thin", cls: "bg-warn/15 text-warn", hint: "Under 15 shots: the planner blends this club with a handicap estimate" },
}

export function BadgePill({ badge }: { badge: Badge }) {
  const b = BADGE_STYLE[badge]
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`} title={b.hint}>
      {b.label}
    </span>
  )
}

/** Label, date, indoor/outdoor and mat/grass: what a session is, shared by upload and manual entry. */
export function SessionFields({ value, onChange }: { value: NewSession; onChange: (v: NewSession) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-xs text-muted">Session name</span>
        <input className={INPUT} value={value.label} maxLength={80} onChange={(e) => onChange({ ...value, label: e.target.value })} placeholder="Range, Oct 4" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Date</span>
        <input className={INPUT} type="date" value={value.date ?? ""} onChange={(e) => onChange({ ...value, date: e.target.value || null })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Where</span>
          <select className={INPUT} value={value.environment} onChange={(e) => onChange({ ...value, environment: e.target.value as NewSession["environment"] })}>
            <option value="outdoor">Outdoor</option>
            <option value="indoor">Indoor</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Hitting from</span>
          <select className={INPUT} value={value.surface} onChange={(e) => onChange({ ...value, surface: e.target.value as NewSession["surface"] })}>
            <option value="grass">Grass</option>
            <option value="mat">Mat</option>
          </select>
        </label>
      </div>
    </div>
  )
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
