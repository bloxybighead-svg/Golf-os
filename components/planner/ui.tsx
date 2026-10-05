"use client"

// Small presentational pieces of the Play planner (moved verbatim from CourseMapClient.tsx).

import { Check, type LucideIcon } from "lucide-react"

export function Stat({ label, value, plays }: { label: string; value: number | null; /** What the distance plays like (wind, height change), shown beside it. */ plays?: number | null }) {
  return (
    <div className="px-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-2xl font-semibold leading-tight text-fg tabular-nums">
        {value ?? "–"}
        <span className="ml-0.5 text-xs font-normal text-muted">yd</span>
        {plays != null && (
          <span className="ml-1.5 text-xs font-normal text-accent" title="The distance as it plays for this club, with the height change and wind">
            · plays {plays}
          </span>
        )}
      </dd>
    </div>
  )
}

// Icon-only (44px) on phones, icon + label from tablet up.
export function ToolButton({
  onClick,
  icon: Icon,
  label,
  active,
}: {
  onClick: () => void
  icon: LucideIcon
  label: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors md:h-9 md:w-auto md:px-3 ${
        active ? "border-accent text-accent" : "border-fg/[0.08] text-fg-3 hover:border-fg/20 hover:text-fg"
      }`}
    >
      <Icon size={15} />
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}

// A full-width row inside the Layers menu.
export function LayerMenuItem({ onClick, label, active }: { onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm ${
        active ? "text-accent" : "text-fg-2 hover:bg-fg/[0.06] hover:text-fg"
      }`}
    >
      {label}
      {active && <Check size={14} />}
    </button>
  )
}
