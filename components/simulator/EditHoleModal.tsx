"use client"

import { useState } from "react"
import { X } from "lucide-react"
import type { LatLng } from "@/lib/course/geo"
import { validateCorrection, type CorrectionInput } from "@/lib/course/corrections"
import type { CourseHole } from "@/lib/course/overpass"

export interface HoleCorrectionSubmission {
  par?: number
  teeLat?: number
  teeLng?: number
  yardageYds?: number
  strokeIndex?: number
  reason: string
}

const PARS = [3, 4, 5, 6]

export function EditHoleModal({
  hole,
  defaultYardageYds,
  courseCenter,
  signedIn,
  submitting,
  onClose,
  onSubmit,
}: {
  hole: CourseHole
  /** Straight tee-to-green distance from the mapped line, shown as a starting point when no yardage has been corrected yet. */
  defaultYardageYds: number
  courseCenter: LatLng
  signedIn: boolean
  submitting: boolean
  onClose: () => void
  onSubmit: (input: HoleCorrectionSubmission) => void
}) {
  const [par, setPar] = useState(hole.par ?? 4)
  const [teeLat, setTeeLat] = useState(hole.line[0].lat.toFixed(6))
  const [teeLng, setTeeLng] = useState(hole.line[0].lng.toFixed(6))
  const [yardage, setYardage] = useState(String(hole.yardageYds ?? Math.round(defaultYardageYds)))
  const [strokeIndex, setStrokeIndex] = useState(String(hole.strokeIndex ?? ""))
  const [reason, setReason] = useState("")

  const parsedTeeLat = Number(teeLat)
  const parsedTeeLng = Number(teeLng)
  const parsedYardage = Number(yardage)
  const parsedStrokeIndex = strokeIndex.trim() === "" ? undefined : Number(strokeIndex)

  const input: CorrectionInput = {
    par,
    teeLat: Number.isFinite(parsedTeeLat) ? parsedTeeLat : undefined,
    teeLng: Number.isFinite(parsedTeeLng) ? parsedTeeLng : undefined,
    yardageYds: Number.isFinite(parsedYardage) ? parsedYardage : undefined,
    strokeIndex: parsedStrokeIndex,
  }
  const errors = validateCorrection(input, courseCenter)
  const hasErrors = Object.keys(errors).length > 0

  function submit() {
    if (hasErrors || !signedIn) return
    // Only send fields that actually changed from what's shown -- no point recording a
    // "correction" that doesn't correct anything.
    const submission: HoleCorrectionSubmission = { reason: reason.trim() }
    if (par !== hole.par) submission.par = par
    if (Number.isFinite(parsedTeeLat) && parsedTeeLat !== hole.line[0].lat) submission.teeLat = parsedTeeLat
    if (Number.isFinite(parsedTeeLng) && parsedTeeLng !== hole.line[0].lng) submission.teeLng = parsedTeeLng
    if (Number.isFinite(parsedYardage) && parsedYardage !== (hole.yardageYds ?? Math.round(defaultYardageYds)))
      submission.yardageYds = parsedYardage
    if (parsedStrokeIndex != null && parsedStrokeIndex !== hole.strokeIndex) submission.strokeIndex = parsedStrokeIndex
    onSubmit(submission)
  }

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[#111111] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Edit Hole {hole.ref ?? "?"} Data</h2>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="mt-1 text-xs text-[#6b7280]">
          Corrections are shared with every golfer who loads this course, not just you.
        </p>

        <div className="mt-3 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#9ca3af]">Par</span>
            <select
              value={par}
              onChange={(e) => setPar(Number(e.target.value))}
              className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
            >
              {PARS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#9ca3af]">Tee latitude</span>
              <input
                value={teeLat}
                onChange={(e) => setTeeLat(e.target.value)}
                inputMode="decimal"
                className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
              />
              {errors.teeLat && <span className="text-[11px] text-red-400">{errors.teeLat}</span>}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#9ca3af]">Tee longitude</span>
              <input
                value={teeLng}
                onChange={(e) => setTeeLng(e.target.value)}
                inputMode="decimal"
                className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
              />
              {errors.teeLng && <span className="text-[11px] text-red-400">{errors.teeLng}</span>}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#9ca3af]">Yardage</span>
              <input
                value={yardage}
                onChange={(e) => setYardage(e.target.value)}
                inputMode="numeric"
                className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
              />
              {errors.yardageYds && <span className="text-[11px] text-red-400">{errors.yardageYds}</span>}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#9ca3af]">Handicap (1-18)</span>
              <input
                value={strokeIndex}
                onChange={(e) => setStrokeIndex(e.target.value)}
                inputMode="numeric"
                placeholder="—"
                className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white placeholder:text-[#4b5563]"
              />
              {errors.strokeIndex && <span className="text-[11px] text-red-400">{errors.strokeIndex}</span>}
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#9ca3af]">Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Par 4, not Par 3"
              className="resize-none rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white placeholder:text-[#4b5563]"
            />
          </label>
        </div>

        {!signedIn && <p className="mt-3 text-xs text-yellow-500">Sign in to submit a correction.</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={hasErrors || !signedIn || submitting}
            className="rounded-lg bg-[#22c55e] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit Correction"}
          </button>
        </div>
      </div>
    </div>
  )
}
