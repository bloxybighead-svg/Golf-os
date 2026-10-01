"use client"

import type { GreenMiss, HoleEntry } from "@/lib/rounds/holes"

/** One tap target: 44px, filled with the accent when chosen. */
export function Choice({
  selected,
  onClick,
  children,
  label,
  className = "",
}: {
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
      className={[
        "flex h-11 min-w-[44px] items-center justify-center rounded-lg border px-2 text-sm font-semibold tabular-nums transition-colors",
        selected ? "border-accent bg-accent text-on-accent" : "border-fg/[0.08] bg-surface text-fg-2 hover:border-fg/20 hover:text-fg",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="label-xs">{label}</p>
      {children}
    </div>
  )
}

/**
 * One hole's taps: par, score, tee shot (not on par 3s), approach, putts and
 * penalty. Tapping a chosen option again clears it. Used by the round form
 * and by Play's Score tab.
 */
export function HolePad({ hole, onChange }: { hole: HoleEntry; onChange: (patch: Partial<HoleEntry>) => void }) {
  // Score buttons around par: par-2 .. par+3, then one more that counts up.
  const scoreChoices = Array.from({ length: 6 }, (_, i) => hole.par - 2 + i).filter((n) => n >= 1)
  const bigNumber = hole.par + 4
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
        <h3 className="text-lg font-semibold text-fg">Hole {hole.hole_number}</h3>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Par">
          <span className="mr-1 text-xs text-muted">Par</span>
          {[3, 4, 5].map((p) => (
            <Choice
              key={p}
              selected={hole.par === p}
              onClick={() =>
                onChange(p === 3 ? { par: p, fairway_hit: null, fairway_miss_side: null } : { par: p })
              }
              label={`Par ${p}`}
            >
              {p}
            </Choice>
          ))}
          <label className="ml-2 flex items-center gap-1 text-xs text-muted" title="Stroke index from the scorecard (1 = hardest), for net double bogey">
            HCP
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
              className="h-11 w-12 rounded-lg border border-fg/[0.08] bg-surface px-1 text-center text-sm text-fg tabular-nums focus:border-accent focus:outline-none"
            />
          </label>
        </div>
      </div>

      <Row label="Score">
        <div className="grid grid-cols-7 gap-1">
          {scoreChoices.map((n) => (
            <Choice key={n} selected={hole.strokes === n} onClick={() => onChange({ strokes: n })}>
              {n}
            </Choice>
          ))}
          <Choice
            selected={hole.strokes != null && hole.strokes >= bigNumber}
            onClick={() =>
              onChange({ strokes: hole.strokes != null && hole.strokes >= bigNumber ? Math.min(hole.strokes + 1, 20) : bigNumber })
            }
            label={hole.strokes != null && hole.strokes >= bigNumber ? `${hole.strokes}, tap for one more` : `${bigNumber} or more`}
          >
            {hole.strokes != null && hole.strokes >= bigNumber ? hole.strokes : `${bigNumber}+`}
          </Choice>
        </div>
      </Row>

      {hole.par > 3 && (
        <Row label="Tee shot">
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
                  {t === "hit" ? "Fairway" : t === "left" ? "Left" : "Right"}
                </Choice>
              )
            })}
          </div>
        </Row>
      )}

      <Row label="Approach">
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
            Green
          </Choice>
          {green("right")}
          <div />
          {green("short")}
          <div />
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

      <Choice selected={hole.penalty} onClick={() => onChange({ penalty: !hole.penalty })} className="px-4">
        Penalty
      </Choice>
    </div>
  )
}
