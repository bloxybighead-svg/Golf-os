"use client"

// What "Hole done" adds when Track every shot is on: an optional first putt, and one question when the
// recorded shots do not add up to the score. Nothing here blocks saving.

import { Choice } from "@/components/rounds/HolePad"
import { FIRST_PUTT_CHOICES_FT, MAX_FIRST_PUTT_FT, type HoleQuestion } from "@/lib/rounds/holeTracking"
import { describeShot, type SwingShot } from "@/lib/rounds/shots"

const INPUT = "h-11 w-20 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"

export function HoleTrackingRows({
  showFirstPutt,
  firstPuttFt,
  onFirstPutt,
  question,
  swings,
  onChip,
  onMissedSwing,
  onDelete,
}: {
  showFirstPutt: boolean
  firstPuttFt: number | null
  onFirstPutt: (ft: number | null) => void
  question: HoleQuestion
  swings: readonly SwingShot[]
  onChip: (count: number) => void
  onMissedSwing: () => void
  onDelete: (shotNumber: number) => void
}) {
  const last = FIRST_PUTT_CHOICES_FT[FIRST_PUTT_CHOICES_FT.length - 1]
  return (
    <div className="space-y-5 border-t border-fg/[0.06] pt-4">
      {showFirstPutt && (
        <div className="space-y-2">
          <p className="label-xs">First putt, feet</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {FIRST_PUTT_CHOICES_FT.map((ft) => (
              <Choice key={ft} selected={firstPuttFt === ft} onClick={() => onFirstPutt(firstPuttFt === ft ? null : ft)} label={ft === last ? "40 feet or more" : `${ft} feet`} className="px-3">
                {ft === last ? `${ft}+` : ft}
              </Choice>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_FIRST_PUTT_FT}
              placeholder="ft"
              aria-label="First putt in feet"
              value={firstPuttFt != null && !FIRST_PUTT_CHOICES_FT.includes(firstPuttFt) ? firstPuttFt : ""}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                onFirstPutt(Number.isInteger(v) && v >= 1 && v <= MAX_FIRST_PUTT_FT ? v : null)
              }}
              className={INPUT}
            />
          </div>
        </div>
      )}

      {question.kind === "missing" && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-fg">
            {question.count} shot{question.count === 1 ? "" : "s"} before putting
          </p>
          <div className="flex flex-wrap gap-2">
            <Choice selected={false} onClick={() => onChip(question.count)} className="px-4">
              Chip
            </Choice>
            <Choice selected={false} onClick={onMissedSwing} className="px-4">
              Missed a swing
            </Choice>
          </div>
        </div>
      )}

      {question.kind === "excess" && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-fg">More shots than your score</p>
          <ul className="divide-y divide-fg/[0.06]">
            {swings.map((s) => (
              <li key={s.shotNumber} className="flex min-h-[44px] items-center justify-between gap-3 text-sm text-fg-2">
                <span className="min-w-0 truncate">
                  {s.shotNumber}. {describeShot(s)}
                </span>
                <button onClick={() => onDelete(s.shotNumber)} className="min-h-[44px] shrink-0 px-2 font-semibold text-danger">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
