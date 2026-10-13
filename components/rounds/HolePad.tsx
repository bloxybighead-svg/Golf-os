"use client"

import { useRef, useState } from "react"
import { PENALTY_SHOTS, type GreenMiss, type HoleEntry, type PenaltyShot } from "@/lib/rounds/holes"

/** One tap target: 44px, filled with the accent when chosen. */
export function Choice({
  selected,
  onClick,
  children,
  label,
  className = "",
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "className"> & {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      {...rest}
      className={[
        "flex h-11 min-w-[44px] items-center justify-center rounded-lg border px-2 text-sm font-semibold transition-colors",
        selected ? "border-accent bg-accent text-on-accent" : "border-fg/[0.08] bg-surface text-fg-2 hover:border-fg/20 hover:text-fg",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  )
}

const PENALTY_SHOT_LABEL: Record<PenaltyShot, string> = { tee: "Tee", approach: "Approach", other: "Other" }

/** The last score button counts up on each tap from here: 8, 9, 10... */
const BIG_SCORE = 8
const SCORE_BUTTONS = [3, 4, 5, 6, 7]
/** Holding the 2 this long scores a 1: a hole in one is rare enough to hide. */
const LONG_PRESS_MS = 500

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="label-xs">{label}</p>
      {children}
    </div>
  )
}

/** The 2 button. Pressing and holding it scores a 1. */
function TwoOrOne({ hole, onChange }: { hole: HoleEntry; onChange: (patch: Partial<HoleEntry>) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false)
  const cancel = () => clearTimeout(timer.current)
  const holeInOne = hole.strokes === 1
  return (
    <Choice
      selected={hole.strokes === 2 || holeInOne}
      label={holeInOne ? "1" : "2, hold for 1"}
      onClick={() => {
        if (!held.current) onChange({ strokes: 2 })
      }}
      onPointerDown={() => {
        held.current = false
        timer.current = setTimeout(() => {
          held.current = true
          onChange({ strokes: 1 })
        }, LONG_PRESS_MS)
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className="select-none"
    >
      {holeInOne ? 1 : 2}
    </Choice>
  )
}

/**
 * One hole's taps, the same in the round form and in Play's "Hole done" sheet:
 * score, putts, then the optional fairway, green and penalty. Par and stroke
 * index come from the scorecard and are read-only until "Edit hole". Tapping a
 * chosen option again clears it.
 */
export function HolePad({ hole, onChange }: { hole: HoleEntry; onChange: (patch: Partial<HoleEntry>) => void }) {
  const [editingHole, setEditingHole] = useState<number | null>(null)
  const editing = editingHole === hole.hole_number
  const big = hole.strokes != null && hole.strokes >= BIG_SCORE
  const green = (side: GreenMiss) => (
    <Choice
      selected={hole.green_hit === false && hole.green_miss_side === side}
      onClick={() =>
        hole.green_hit === false && hole.green_miss_side === side
          ? onChange({ green_hit: null, green_miss_side: null })
          : onChange({ green_hit: false, green_miss_side: side })
      }
      label={`Green missed ${side}`}
      className="w-full"
    >
      {side[0].toUpperCase() + side.slice(1)}
    </Choice>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-fg">
          Hole {hole.hole_number}
          <span className="ml-2 text-sm font-normal text-fg-3">
            Par {hole.par}
            {hole.stroke_index != null && ` · SI ${hole.stroke_index}`}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setEditingHole(editing ? null : hole.hole_number)}
          className="h-11 shrink-0 px-2 text-sm font-semibold text-accent hover:underline"
        >
          {editing ? "Done" : "Edit hole"}
        </button>
      </div>

      {editing && (
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Par">
          <span className="mr-1 text-xs text-muted">Par</span>
          {[3, 4, 5].map((p) => (
            <Choice
              key={p}
              selected={hole.par === p}
              onClick={() => onChange(p === 3 ? { par: p, fairway_hit: null, fairway_miss_side: null } : { par: p })}
              label={`Par ${p}`}
            >
              {p}
            </Choice>
          ))}
          <label className="ml-2 flex items-center gap-1 text-xs text-muted" title="Stroke index from the scorecard (1 = hardest), for net double bogey">
            SI
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={18}
              value={hole.stroke_index ?? ""}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                onChange({ stroke_index: Number.isInteger(v) && v >= 1 && v <= 18 ? v : null })
              }}
              aria-label={`Hole ${hole.hole_number} stroke index`}
              className="h-11 w-12 rounded-lg border border-fg/[0.08] bg-surface px-1 text-center text-sm text-fg focus:border-accent focus:outline-none"
            />
          </label>
        </div>
      )}

      <Row label="Score">
        <div className="grid grid-cols-7 gap-1">
          <TwoOrOne hole={hole} onChange={onChange} />
          {SCORE_BUTTONS.map((n) => (
            <Choice key={n} selected={hole.strokes === n} onClick={() => onChange({ strokes: n })}>
              {n}
            </Choice>
          ))}
          <Choice
            selected={big}
            onClick={() => onChange({ strokes: big ? Math.min(hole.strokes! + 1, 20) : BIG_SCORE })}
            label={big ? `${hole.strokes}, tap for one more` : `${BIG_SCORE} or more`}
          >
            {big ? hole.strokes : `${BIG_SCORE}+`}
          </Choice>
        </div>
      </Row>

      <Row label="Putts">
        <div className="grid grid-cols-5 gap-1.5">
          {[0, 1, 2, 3, 4].map((n) => {
            const selected = n === 4 ? (hole.putts ?? 0) >= 4 : hole.putts === n
            return (
              <Choice
                key={n}
                selected={selected}
                onClick={() =>
                  onChange({ putts: n === 4 && selected ? Math.min((hole.putts ?? 4) + 1, 10) : selected ? null : n })
                }
                label={n === 4 ? "4 or more putts" : `${n} putts`}
              >
                {n === 4 && (hole.putts ?? 0) > 4 ? hole.putts : n === 4 ? "4+" : n}
              </Choice>
            )
          })}
        </div>
      </Row>

      <div className="space-y-5 border-t border-fg/[0.06] pt-4">
        <p className="text-xs text-muted">Optional</p>

        {hole.par > 3 && (
          <Row label="Fairway">
            <div className="grid grid-cols-3 gap-1.5">
              {(["left", "hit", "right"] as const).map((t) => {
                const selected = t === "hit" ? hole.fairway_hit === true : hole.fairway_hit === false && hole.fairway_miss_side === t
                return (
                  <Choice
                    key={t}
                    selected={selected}
                    onClick={() =>
                      selected
                        ? onChange({ fairway_hit: null, fairway_miss_side: null })
                        : t === "hit"
                          ? onChange({ fairway_hit: true, fairway_miss_side: null })
                          : onChange({ fairway_hit: false, fairway_miss_side: t })
                    }
                    label={t === "hit" ? "Fairway hit" : `Fairway missed ${t}`}
                  >
                    {t === "hit" ? "Hit" : t === "left" ? "Left" : "Right"}
                  </Choice>
                )
              })}
            </div>
          </Row>
        )}

        <Row label="Green">
          {/* Laid out like the green: long above, short below */}
          <div className="grid grid-cols-3 gap-1.5">
            <div />
            {green("long")}
            <div />
            {green("left")}
            <Choice
              selected={hole.green_hit === true}
              onClick={() =>
                hole.green_hit === true
                  ? onChange({ green_hit: null, green_miss_side: null })
                  : onChange({ green_hit: true, green_miss_side: null })
              }
              label="Green in regulation"
              className="w-full"
            >
              Hit
            </Choice>
            {green("right")}
            <div />
            {green("short")}
            <div />
          </div>
        </Row>

        <Choice selected={hole.penalty} onClick={() => onChange({ penalty: !hole.penalty, penalty_shot: null })} className="px-4">
          Penalty
        </Choice>
        {hole.penalty && (
          <Row label="Penalty on">
            <div className="flex flex-wrap gap-2">
              {PENALTY_SHOTS.map((shot) => (
                <Choice
                  key={shot}
                  selected={hole.penalty_shot === shot}
                  onClick={() => onChange({ penalty_shot: hole.penalty_shot === shot ? null : shot })}
                  className="px-4"
                >
                  {PENALTY_SHOT_LABEL[shot]}
                </Choice>
              ))}
            </div>
          </Row>
        )}
      </div>
    </div>
  )
}
