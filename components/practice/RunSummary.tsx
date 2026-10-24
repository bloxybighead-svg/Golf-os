"use client"

// The end of a session: each drill's score against last time and its level, one notes field, Done.

import Link from "next/link"
import { SESSION_PATH, type ActiveSession } from "@/lib/practice/activeSession"
import { summarize } from "@/lib/practice/runner"
import { RunnerFrame } from "./RunnerScreen"

/** Launch Pro records the Club Work session at the home net and the simulator; the range reads targets by eye. */
const LAUNCH_PRO_LOCATIONS = ["home_net", "simulator"]

export function RunSummary({
  session,
  compact,
  canSave,
  onNotes,
  onDone,
}: {
  session: ActiveSession
  compact: boolean
  /** Signed in, or started signed in. Without it Done would have nowhere to save to. */
  canSave: boolean
  onNotes: (notes: string) => void
  onDone: () => void
}) {
  const drills = summarize(session)
  const clubWork = session.steps.some((s) => s.kind === "club_work") && LAUNCH_PRO_LOCATIONS.includes(session.location)

  return (
    <RunnerFrame compact={compact} header={<p className="px-1 text-sm font-semibold text-fg">{session.status === "ended_early" ? "Ended early" : "Session done"}</p>}>
      <div className="space-y-5">
        <ul className="divide-y divide-fg/[0.06]">
          {drills.map((d) => (
            <li key={d.drillId} className="py-3">
              <p className="text-sm text-fg">
                <span className="font-semibold">{d.name}:</span> {d.result}
                {d.last != null && <span className="text-muted">, last time {d.last}</span>}
              </p>
              {d.level.to && !d.skipped && (
                <p className="mt-0.5 text-xs text-muted">
                  {d.level.moved ? `Level ${d.level.moved}: ${d.level.from} → ${d.level.to}` : `Level: ${d.level.to}`}
                </p>
              )}
            </li>
          ))}
        </ul>

        {clubWork && (
          <Link href="/you/bag/shots" className="flex min-h-11 items-center justify-center rounded-lg border border-fg/[0.08] bg-surface px-4 text-sm font-semibold text-fg hover:bg-fg/[0.04]">
            Import Launch Pro session
          </Link>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs text-muted">Notes</span>
          <textarea
            rows={3}
            value={session.notes}
            onChange={(e) => onNotes(e.target.value)}
            className="w-full resize-none rounded-lg border border-fg/[0.08] bg-surface px-3 py-2 text-sm text-fg focus:border-accent/60 focus:outline-none"
          />
        </label>

        {canSave ? (
          <button type="button" onClick={onDone} className="flex min-h-14 w-full items-center justify-center rounded-lg bg-accent text-lg font-semibold text-on-accent transition-all hover:brightness-110">
            Done
          </button>
        ) : (
          <>
            <Link href={`/login?redirect=${encodeURIComponent(SESSION_PATH)}`} className="flex min-h-14 w-full items-center justify-center rounded-lg bg-accent text-lg font-semibold text-on-accent transition-all hover:brightness-110">
              Sign in to save
            </Link>
            <p className="text-sm text-fg-3">Your session stays on this phone until you save it.</p>
          </>
        )}
      </div>
    </RunnerFrame>
  )
}
