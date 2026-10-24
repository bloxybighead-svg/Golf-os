"use client"

import { useState } from "react"
import { Choice } from "@/components/rounds/HolePad"
import { BottomSheet } from "@/components/play/BottomSheet"
import { distanceYds, type LatLng } from "@/lib/course/geo"
import { EDITABLE_LIES, isTooLong, lieLabel, MAX_PENALTY_STROKES, type SwingShot } from "@/lib/rounds/shots"

export type ShotPatch = Partial<Pick<SwingShot, "club" | "toLie" | "penaltyStrokes">>

/**
 * "7-Iron (suggested) · 162 yd · Edit": the shot just tapped in. "Suggested" until the golfer picks the club.
 * A shot longer than its club goes turns into a warning with a way to add the shot that was missed.
 */
export function LastShotLine({
  shot,
  ball,
  clubs,
  totalByClub,
  onEdit,
  onDelete,
  onAdd,
}: {
  shot: SwingShot
  /** Where the ball is now: the end of a shot that has not finished yet. */
  ball: LatLng | null
  clubs: readonly string[]
  /** Each bag club's mean total (carry plus roll), for the "too long" check. */
  totalByClub: ReadonlyMap<string, number>
  onEdit: (patch: ShotPatch) => void
  onDelete: () => void
  onAdd: () => void
}) {
  const [open, setOpen] = useState(false)
  const end = shot.to ?? ball
  const yards = end ? Math.round(distanceYds(shot.from, end)) : null
  const tooLong = isTooLong(shot, ball, totalByClub)
  const choices = clubs.includes(shot.club) ? clubs : [shot.club, ...clubs]
  return (
    <>
      <p className={`flex w-fit max-w-full items-center rounded-md bg-black/70 pl-2 text-xs text-white ${tooLong ? "border border-warn" : ""}`}>
        {tooLong ? (
          <>
            <span className="min-w-0 py-1">Longer than your {shot.club} goes. Missed a shot?</span>
            <button onClick={onAdd} className="flex h-11 shrink-0 items-center px-2 font-semibold text-warn underline">
              Add one
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate">
              {shot.club}
              {!shot.clubConfirmed && " (suggested)"}
              {yards != null && ` · ${yards} yd`}
            </span>
            <span aria-hidden className="shrink-0 px-1 text-white/60">·</span>
          </>
        )}
        {!tooLong && (
          <button onClick={() => setOpen(true)} className="flex h-11 shrink-0 items-center pr-2 font-semibold text-white underline">
            Edit
          </button>
        )}
      </p>
      {open && (
        <BottomSheet label="Edit shot" title={`Hole ${shot.holeNumber}, shot ${shot.shotNumber}`} onClose={() => setOpen(false)}>
          <section className="space-y-2">
            <p className="label-xs">Club</p>
            <div className="flex flex-wrap gap-1.5">
              {choices.map((c) => (
                <Choice key={c} selected={c === shot.club && shot.clubConfirmed} onClick={() => onEdit({ club: c })} className="px-3">
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
          <button
            onClick={() => {
              onDelete()
              setOpen(false)
            }}
            className="min-h-[44px] text-sm font-semibold text-danger"
          >
            Delete this shot
          </button>
        </BottomSheet>
      )}
    </>
  )
}
