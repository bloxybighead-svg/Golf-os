"use client"

import { useEffect, useState } from "react"
import { readTrackShots, saveTrackShots } from "@/lib/rounds/sgSettings"

/** "Track every shot": off by default, remembered on this device. The same switch on Settings and on the Start round sheet. */
export function TrackShotsToggle({ onChange }: { onChange?: (on: boolean) => void }) {
  // Saved in the browser only, so nothing shows as chosen until mount.
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    const v = readTrackShots()
    setOn(v)
    onChange?.(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle() {
    const next = !on
    saveTrackShots(next)
    setOn(next)
    onChange?.(next)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">Track every shot</p>
        <p className="mt-0.5 text-xs text-muted">Tap Shot for each swing for more detail. Strokes gained works without it.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on === true}
        aria-label="Track every shot"
        onClick={toggle}
        disabled={on === null}
        className={`h-11 min-w-[64px] shrink-0 rounded-lg border px-3 text-xs font-semibold ${on ? "border-accent text-accent" : "border-fg/[0.08] text-fg-3"}`}
      >
        {on ? "On" : "Off"}
      </button>
    </div>
  )
}
