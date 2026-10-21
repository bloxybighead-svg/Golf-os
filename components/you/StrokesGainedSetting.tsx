"use client"

import { useEffect, useState } from "react"
import { TrackShotsToggle } from "@/components/play/TrackShotsToggle"
import { cleanHandicap } from "@/lib/golfer/baseline"
import { readSgCompare, saveSgCompare, type SgCompare } from "@/lib/rounds/sgSettings"

const CHOICES: { kind: SgCompare["kind"]; label: string }[] = [
  { kind: "scratch", label: "Scratch" },
  { kind: "handicap", label: "Your handicap" },
  { kind: "typed", label: "Other" },
]

/** What strokes gained is measured against, and whether Play tracks every shot. Saved on this device. */
export function StrokesGainedSetting() {
  const [choice, setChoice] = useState<SgCompare | null>(null)
  const [typed, setTyped] = useState("")
  useEffect(() => {
    const c = readSgCompare()
    setChoice(c)
    if (c.kind === "typed") setTyped(String(c.handicap))
  }, [])

  function choose(kind: SgCompare["kind"]) {
    if (kind === "typed") {
      const h = cleanHandicap(typed)
      const next: SgCompare = { kind: "typed", handicap: h ?? 10 }
      if (h == null) setTyped("10")
      saveSgCompare(next)
      setChoice(next)
    } else {
      saveSgCompare({ kind })
      setChoice({ kind })
    }
  }

  function type(raw: string) {
    setTyped(raw)
    const h = cleanHandicap(raw)
    if (h != null) {
      const next: SgCompare = { kind: "typed", handicap: h }
      saveSgCompare(next)
      setChoice(next)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <div>
        <p className="label-xs">Strokes gained</p>
        <p className="mt-1 text-xs text-muted">Measured against: the strokes to hole out for a scratch golfer, your handicap, or one you type</p>
      </div>
      <div role="radiogroup" aria-label="Measured against" className="grid grid-cols-3 gap-1 rounded-lg border border-fg/[0.06] bg-surface-3 p-1">
        {CHOICES.map(({ kind, label }) => (
          <button
            key={kind}
            role="radio"
            aria-checked={choice?.kind === kind}
            onClick={() => choose(kind)}
            className={`min-h-[44px] rounded-md px-2 text-xs font-normal transition-colors ${choice?.kind === kind ? "bg-surface text-fg" : "text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {choice?.kind === "typed" && (
        <label className="flex items-center gap-3 text-xs text-fg-2">
          Handicap
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={-10}
            max={54}
            value={typed}
            onChange={(e) => type(e.target.value)}
            aria-label="Handicap to measure against"
            className="h-11 w-24 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg focus:border-accent/60 focus:outline-none"
          />
        </label>
      )}
      <div className="border-t border-fg/[0.06] pt-4">
        <TrackShotsToggle />
      </div>
    </div>
  )
}
