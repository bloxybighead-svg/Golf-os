"use client"

// Asked before End session when at least one set has a score: ending takes the golfer to the summary.

import { BottomSheet } from "@/components/play/BottomSheet"

const BUTTON = "flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold"

export function EndSessionSheet({ scored, total, onEnd, onKeepGoing }: { scored: number; total: number; onEnd: () => void; onKeepGoing: () => void }) {
  return (
    <BottomSheet
      label="End session"
      title={`End now? ${scored} of ${total} sets scored`}
      onClose={onKeepGoing}
      footer={
        <>
          <button type="button" onClick={onEnd} className={`${BUTTON} bg-accent text-on-accent hover:brightness-110`}>
            End
          </button>
          <button type="button" onClick={onKeepGoing} className={`${BUTTON} border border-fg/[0.08] bg-surface text-fg hover:bg-fg/[0.04]`}>
            Keep going
          </button>
        </>
      }
    >
      {null}
    </BottomSheet>
  )
}
