// The session the answers built: total time, when it ends, where, the blocks, what to bring, and the engine's notes.

import type { SessionPlan } from "@/lib/practice/session"
import { LOCATION_CHOICES } from "@/lib/practice/startSession"
import type { LibraryDrill } from "@/lib/supabase/types"

const clockTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

export function SessionCard({ plan, location, library }: { plan: SessionPlan; location: string; library: readonly LibraryDrill[] }) {
  const bring = [
    ...new Set(
      plan.blocks.flatMap((b) =>
        (library.find((d) => d.id === b.drillId)?.equipment ?? "")
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      )
    ),
  ]
  return (
    <div className="space-y-4">
      {plan.blocks.length > 0 && plan.endsAt && (
        <div>
          <p className="text-lg font-semibold text-fg">
            {plan.practiceMinutes + plan.loggingMinutes} min · ends {clockTime(plan.endsAt)}
          </p>
          <p className="text-sm text-muted">
            {LOCATION_CHOICES.find((l) => l.value === location)?.label ?? location} · {plan.loggingMinutes} min to log
          </p>
        </div>
      )}

      {plan.blocks.length > 0 && (
        <ul className="divide-y divide-fg/[0.06]">
          {plan.blocks.map((b, i) => (
            <li key={i} className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-fg">{b.name}</span>
              <span className="shrink-0 text-fg-2">{b.minutes} min</span>
            </li>
          ))}
        </ul>
      )}

      {bring.length > 0 && (
        <p className="text-sm text-fg-2">
          <span className="text-xs text-muted">Bring </span>
          {bring.join(", ")}
        </p>
      )}

      {plan.notes.map((n) => (
        <p key={n} className="text-sm text-fg">
          {n}
        </p>
      ))}
    </div>
  )
}
