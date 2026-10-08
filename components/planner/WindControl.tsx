"use client"

// Wind and air temperature under the result card: what is blowing (automatic
// reading, or the golfer's own setting), a speed slider 0-30 mph, a dial for where
// it comes from relative to the hole, a temperature field in degrees F with -10 and
// +10 buttons, and the "Plays like" switch. The arithmetic is in lib/course/wind.ts.

import { useRef, useState } from "react"
import type { WindState } from "@/hooks/useWind"
import { clampTemperature, describeWind, relativeToHole, TEMP_MAX_F, TEMP_MIN_F, timeLabel, WIND_MAX_MPH, WIND_MIN_MPH } from "@/lib/course/wind"

const DIAL = 96
const KEY_STEP_DEG = 15
/** What the -10 and +10 buttons move the temperature by, degrees F. */
const TEMP_STEP_F = 10

export interface WindControlProps {
  wind: WindState
  /** Which way the hole plays (tee to green), compass degrees; null when no hole is open. */
  holeBearingDeg: number | null
  playsLikeOn: boolean
  onPlaysLikeChange: (on: boolean) => void
  /** Ground heights for this hole are loaded. */
  hasElevation: boolean
}

export function WindControl({ wind, holeBearingDeg, playsLikeOn, onPlaysLikeChange, hasElevation }: WindControlProps) {
  const [open, setOpen] = useState(false)
  const bearing = holeBearingDeg ?? 0
  const speed = wind.wind?.speedMph ?? 0
  // 0 = the wind comes from the green end of the hole (into your face).
  const rel = wind.wind ? relativeToHole(wind.wind.fromDeg, bearing) : 0

  const summary = wind.wind ? describeWind(wind.wind, holeBearingDeg) : "No wind reading"
  const source = wind.source === "manual" ? "set by you" : wind.source === "auto" ? "automatic" : ""
  const temp = wind.temperature
  const tempSource = temp.source === "manual" ? "set by you" : temp.source === "auto" ? "automatic" : ""
  const time = wind.at != null && (wind.labelTime || wind.source === "manual") ? ` · ${wind.labelTime ? "last reading " : ""}${timeLabel(wind.at)}` : ""

  return (
    <div className="rounded-2xl border border-fg/[0.07] bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="label-xs">Wind</p>
          <p className="truncate text-sm text-fg tabular-nums">
            {summary}
            {source && (
              <span className="text-xs text-muted">
                {" · "}
                {source}
                {time}
              </span>
            )}
          </p>
          <p className="truncate text-sm text-fg tabular-nums">
            {temp.temperatureF != null ? `${temp.temperatureF}°F` : "No temperature reading"}
            {tempSource && <span className="text-xs text-muted">{` · ${tempSource}`}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={playsLikeOn}
            onClick={() => onPlaysLikeChange(!playsLikeOn)}
            title="Plays like: change the plan for wind, air temperature and the height change to the target"
            className={`h-9 rounded-lg border px-3 text-xs font-semibold ${playsLikeOn ? "border-accent text-accent" : "border-fg/[0.08] text-fg-3"}`}
          >
            Plays like {playsLikeOn ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="h-9 rounded-lg border border-fg/[0.08] px-3 text-xs text-fg-3 hover:text-fg"
          >
            {open ? "Done" : "Adjust"}
          </button>
        </div>
      </div>

      {playsLikeOn && !hasElevation && <p className="mt-1 text-[11px] text-fg-3">No ground heights for this hole yet: the ground counts as level.</p>}

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <WindDial
            relDeg={rel}
            speedMph={speed}
            onChange={(deg) => wind.setManual(speed, deg, bearing)}
            disabled={holeBearingDeg == null}
          />
          <div className="min-w-[10rem] flex-1 space-y-2">
            <label className="block text-xs text-fg-3">
              Speed <span className="font-semibold text-fg tabular-nums">{speed} mph</span>
              <input
                type="range"
                min={WIND_MIN_MPH}
                max={WIND_MAX_MPH}
                step={1}
                value={speed}
                onChange={(e) => wind.setManual(Number(e.target.value), rel, bearing)}
                className="mt-1 h-11 w-full accent-[rgb(var(--accent))] md:h-6"
              />
            </label>
            <p className="text-[11px] text-fg-3">Tap the dial where the wind is coming from: top is into your face, along the hole.</p>
            {wind.source === "manual" && (
              <button type="button" onClick={wind.clearManual} className="h-9 rounded-lg border border-fg/[0.08] px-3 text-xs font-semibold text-accent hover:bg-accent/10">
                Back to automatic
              </button>
            )}
          </div>
          <TemperatureField wind={wind} />
        </div>
      )}
    </div>
  )
}

// Air temperature in degrees F: type it, or step it by 10. Warmer air carries the ball farther, colder air shorter.
function TemperatureField({ wind }: { wind: WindState }) {
  const current = wind.temperature.temperatureF
  const [draft, setDraft] = useState<string | null>(null)
  const step = (d: number) => wind.setManualTemperature((current ?? 70) + d)
  const commit = () => {
    if (draft != null && draft.trim() !== "" && Number.isFinite(Number(draft))) wind.setManualTemperature(clampTemperature(Number(draft)))
    setDraft(null)
  }
  return (
    <div className="w-full space-y-1">
      <p className="text-xs text-fg-3">Temperature</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => step(-TEMP_STEP_F)} disabled={(current ?? 70) - TEMP_STEP_F < TEMP_MIN_F} aria-label="10 degrees colder" className="h-11 w-14 rounded-lg border border-fg/[0.08] text-sm font-semibold text-fg-2 hover:text-fg disabled:opacity-40 md:h-9">
          -10
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={TEMP_MIN_F}
          max={TEMP_MAX_F}
          aria-label="Air temperature in degrees Fahrenheit"
          value={draft ?? (current != null ? String(current) : "")}
          placeholder="°F"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="h-11 w-20 rounded-lg border border-fg/[0.08] bg-page px-3 text-center text-sm text-fg tabular-nums md:h-9"
        />
        <span className="text-xs text-fg-3">°F</span>
        <button type="button" onClick={() => step(TEMP_STEP_F)} disabled={(current ?? 70) + TEMP_STEP_F > TEMP_MAX_F} aria-label="10 degrees warmer" className="h-11 w-14 rounded-lg border border-fg/[0.08] text-sm font-semibold text-fg-2 hover:text-fg disabled:opacity-40 md:h-9">
          +10
        </button>
        {wind.temperature.source === "manual" && (
          <button type="button" onClick={wind.clearManualTemperature} className="h-9 rounded-lg border border-fg/[0.08] px-3 text-xs font-semibold text-accent hover:bg-accent/10">
            Back to automatic
          </button>
        )}
      </div>
    </div>
  )
}

// A round dial with the hole running up the screen. The arrow shows where the wind goes; the golfer taps (or drags,
// or uses the arrow keys) where it comes from.
function WindDial({ relDeg, speedMph, onChange, disabled }: { relDeg: number; speedMph: number; onChange: (relDeg: number) => void; disabled: boolean }) {
  const ref = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  function pick(e: React.PointerEvent) {
    const box = ref.current?.getBoundingClientRect()
    if (!box || disabled) return
    const dx = e.clientX - (box.left + box.width / 2)
    const dy = e.clientY - (box.top + box.height / 2)
    if (Math.hypot(dx, dy) < 6) return
    onChange((((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360)
  }

  const c = DIAL / 2
  // The source point on the rim, and the arrow from it toward the centre.
  const rad = (relDeg * Math.PI) / 180
  const sx = c + Math.sin(rad) * (c - 10)
  const sy = c - Math.cos(rad) * (c - 10)
  return (
    <svg
      ref={ref}
      width={DIAL}
      height={DIAL}
      viewBox={`0 0 ${DIAL} ${DIAL}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Wind direction relative to the hole"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(relDeg)}
      aria-valuetext={`${Math.round(relDeg)} degrees from the green end of the hole`}
      className={`shrink-0 touch-none ${disabled ? "opacity-40" : "cursor-pointer"}`}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        pick(e)
      }}
      onPointerMove={(e) => dragging.current && pick(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange((relDeg + KEY_STEP_DEG) % 360)
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange((relDeg - KEY_STEP_DEG + 360) % 360)
        else return
        e.preventDefault()
      }}
    >
      <circle cx={c} cy={c} r={c - 2} fill="none" className="stroke-fg/20" strokeWidth={1.5} />
      <text x={c} y={13} textAnchor="middle" className="fill-muted" fontSize={9}>
        green
      </text>
      <text x={c} y={DIAL - 5} textAnchor="middle" className="fill-muted" fontSize={9}>
        tee
      </text>
      <line x1={c} y1={20} x2={c} y2={DIAL - 20} className="stroke-fg/10" strokeWidth={1} />
      {speedMph > 0 && (
        <>
          <line x1={sx} y1={sy} x2={c} y2={c} className="stroke-accent" strokeWidth={3} strokeLinecap="round" />
          <circle cx={sx} cy={sy} r={5} className="fill-accent" />
        </>
      )}
      <circle cx={c} cy={c} r={3} className="fill-fg" />
    </svg>
  )
}
