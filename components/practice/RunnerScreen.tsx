"use client"

// The set screen: progress, the set, one cue, the routine rule, score entry. The header carries Pause, the block
// timer and the menu (Skip set, End session). On phones it is the whole screen (the layout's chrome is hidden by
// html[data-round]); elsewhere it sits in the page like any other.

import { useState, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import type { ActiveSession } from "@/lib/practice/activeSession"
import { UNDO_MS, blockTimer, currentStep, cutoffNotice, progress, scoredSets } from "@/lib/practice/runner"
import { EndSessionSheet } from "./EndSessionSheet"
import { ScoreEntry, type EntryInput } from "./ScoreEntry"

const MENU_ITEM = "flex min-h-11 w-full items-center px-4 text-left text-sm text-fg hover:bg-fg/[0.04]"

/** Header row plus a scrolling body; fixed over the whole screen on phones. */
export function RunnerFrame({ compact, header, children }: { compact: boolean; header: ReactNode; children: ReactNode }) {
  return (
    <div className={compact ? "fixed inset-0 z-40 flex flex-col bg-page pt-[env(safe-area-inset-top)]" : "mx-auto flex max-w-xl flex-col pt-4"} data-runner-screen>
      <div className="relative z-10 flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-fg/[0.08] px-3">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">{children}</div>
    </div>
  )
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`

export function RunnerScreen({
  session,
  now,
  compact,
  onSave,
  onSkip,
  onUndo,
  onEnd,
  onPause,
  onJumpToCloseout,
}: {
  session: ActiveSession
  now: number
  compact: boolean
  onSave: (input: EntryInput) => void
  onSkip: () => void
  onUndo: () => void
  onEnd: () => void
  onPause: () => void
  onJumpToCloseout: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const step = currentStep(session)
  if (!step) return null
  const { done, total } = progress(session)
  const timer = blockTimer(session, now)
  const notice = cutoffNotice(session, now)
  const scored = scoredSets(session)
  const canUndo = session.lastSavedAt != null && now - session.lastSavedAt <= UNDO_MS && session.entries.length > 0

  const header = (
    <>
      <button type="button" onClick={onPause} className="flex h-11 items-center rounded-lg px-3 text-sm font-semibold text-fg hover:bg-fg/[0.04]">
        Pause
      </button>
      {timer && (
        <p
          aria-label="Block timer"
          className={`min-w-0 truncate text-sm tabular-nums ${timer.over ? "font-semibold text-warn" : "text-muted"}`}
        >
          {clock(timer.elapsedMs)} / {Math.round(timer.plannedMin)} min
        </p>
      )}
      <div className="relative">
        <button type="button" aria-label="Session menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className="flex h-11 w-11 items-center justify-center rounded-lg text-fg hover:bg-fg/[0.04]">
          <MoreHorizontal size={20} />
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-fg/[0.08] bg-surface">
            <button
              role="menuitem"
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenu(false)
                onSkip()
              }}
            >
              Skip set
            </button>
            <button
              role="menuitem"
              type="button"
              className={`${MENU_ITEM} border-t border-fg/[0.06]`}
              onClick={() => {
                setMenu(false)
                if (scored > 0) setConfirmEnd(true)
                else onEnd()
              }}
            >
              End session
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <RunnerFrame compact={compact} header={header}>
      <div className="flex min-h-full flex-col gap-5 landscape:grid landscape:grid-cols-2 landscape:items-start">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-fg">
              {step.drillName} · Set {step.setIndex + 1} of {step.setCount}
            </p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-fg/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
              <div className="h-full bg-accent" style={{ width: `${(done / total) * 100}%` }} />
            </div>
          </div>
          <div>
            <p className="text-xl font-semibold text-fg">
              {step.club ?? step.label} · {step.balls} {step.balls === 1 ? "ball" : "balls"}
            </p>
            <p className="mt-1 text-sm text-muted">{step.setup}</p>
          </div>
          {step.cue && <p className="text-2xl font-semibold leading-snug text-fg">“{step.cue}”</p>}
          {step.routineRule && <p className="text-xs text-muted">{step.routineRule}</p>}
        </div>

        <div className="mt-auto space-y-3 landscape:mt-0">
          {notice && (
            <button type="button" onClick={onJumpToCloseout} className="flex min-h-11 w-full items-center text-left text-sm font-semibold text-warn">
              {notice.minutes} min to cutoff · jump to close-out
            </button>
          )}
          <ScoreEntry key={session.entries.length} step={step} onSave={onSave} />
          <div className="min-h-6">
            {canUndo && (
              <button type="button" onClick={onUndo} className="text-xs text-muted underline underline-offset-2">
                Undo last save
              </button>
            )}
          </div>
        </div>
      </div>
      {confirmEnd && (
        <EndSessionSheet
          scored={scored}
          total={session.steps.length}
          onEnd={() => {
            setConfirmEnd(false)
            onEnd()
          }}
          onKeepGoing={() => setConfirmEnd(false)}
        />
      )}
    </RunnerFrame>
  )
}
