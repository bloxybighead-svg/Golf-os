"use client"

import { useState } from "react"
import { Choice } from "@/components/rounds/HolePad"
import { BottomSheet } from "@/components/play/BottomSheet"
import { describeShot, EDITABLE_LIES, lieLabel, MAX_PENALTY_STROKES, type SwingShot } from "@/lib/rounds/shots"

type Patch = Partial<Pick<SwingShot, "club" | "toLie" | "penaltyStrokes">>

/** "Last shot: 7-Iron, fairway, 162 yd · Edit": the shot just recorded, with a way to correct its club, lie and penalty. */
export function LastShotLine({ shot, clubs, onEdit }: { shot: SwingShot; clubs: readonly string[]; onEdit: (patch: Patch) => void }) {
  const [open, setOpen] = useState(false)
  const choices = clubs.includes(shot.club) ? clubs : [shot.club, ...clubs]
  return (
    <>
      <p className="flex w-fit max-w-full items-center rounded-md bg-black/70 pl-2 text-xs text-white">
        <span className="min-w-0 truncate">Last shot: {describeShot(shot)}</span>
        <span aria-hidden className="shrink-0 px-1 text-white/60">·</span>
        <button onClick={() => setOpen(true)} className="flex h-11 shrink-0 items-center pr-2 font-semibold text-white underline">
          Edit
        </button>
      </p>
      {open && (
        <BottomSheet label="Edit last shot" title={`Hole ${shot.holeNumber}, shot ${shot.shotNumber}`} onClose={() => setOpen(false)}>
          <section className="space-y-2">
            <p className="label-xs">Club</p>
            <div className="flex flex-wrap gap-1.5">
              {choices.map((c) => (
                <Choice key={c} selected={c === shot.club} onClick={() => onEdit({ club: c })} className="px-3">
                  {c}
                </Choice>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <p className="label-xs">Finished in</p>
            <div className="flex flex-wrap gap-1.5">
              {EDITABLE_LIES.map((l) => (
                <Choice key={l} selected={l === shot.toLie} onClick={() => onEdit({ toLie: l })} className="px-3 capitalize">
                  {lieLabel(l)}
                </Choice>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <p className="label-xs">Penalty strokes</p>
            <div className="flex gap-1.5">
              {Array.from({ length: MAX_PENALTY_STROKES + 1 }, (_, n) => (
                <Choice key={n} selected={n === shot.penaltyStrokes} onClick={() => onEdit({ penaltyStrokes: n })}>
                  {n}
                </Choice>
              ))}
            </div>
          </section>
        </BottomSheet>
      )}
    </>
  )
}
