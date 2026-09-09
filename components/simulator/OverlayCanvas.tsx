"use client"

import { yardsToPixels, type TransformConfig } from "@/lib/dispersion/transform"

export interface OverlayShot {
  carryYds: number
  offlineYds: number
}

export interface OverlaySeries {
  key: string
  label: string
  color: string
  shots: OverlayShot[]
  markerRadius?: number
  markerShape?: "circle" | "cross" // cross = real shots, circle = simulated
}

interface Props {
  series: OverlaySeries[]
  widthPx?: number
  heightPx?: number
  minCarryYds?: number
  maxCarryYds: number
  widthYds: number
}

// Same single-source-of-truth transform pattern as DispersionCanvas: every
// point on this chart (any series, any color) goes through this one config.
// The visible window is [minCarryYds, maxCarryYds], not always [0, max] --
// see DispersionCanvas for why (otherwise short clubs render as a tiny
// cluster at the top of a mostly-empty canvas).
function buildTransform(
  widthPx: number,
  heightPx: number,
  minCarryYds: number,
  maxCarryYds: number,
  widthYds: number
): TransformConfig {
  const margin = 20
  const carrySpan = Math.max(maxCarryYds - minCarryYds, 1)
  const scaleX = widthPx / widthYds
  const scaleY = (heightPx - margin * 2) / carrySpan
  const scale = Math.min(scaleX, scaleY)
  const originY = heightPx - margin + minCarryYds * scale
  return { originX: widthPx / 2, originY, scale }
}

export function OverlayCanvas({ series, widthPx = 640, heightPx = 640, minCarryYds = 0, maxCarryYds, widthYds }: Props) {
  const cfg = buildTransform(widthPx, heightPx, minCarryYds, maxCarryYds, widthYds)
  const tee = yardsToPixels({ carryYds: 0, offlineYds: 0 }, cfg)

  const NICE_STEPS = [5, 10, 25, 50, 100]
  const rawStep = (maxCarryYds - minCarryYds) / 5
  const gridlineStepYds = NICE_STEPS.find((s) => s >= rawStep) ?? 100
  const firstGridline = Math.ceil(minCarryYds / gridlineStepYds) * gridlineStepYds
  const gridlines: number[] = []
  for (let y = firstGridline; y <= maxCarryYds; y += gridlineStepYds) gridlines.push(y)

  return (
    <div>
      <svg
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        width="100%"
        style={{ maxWidth: widthPx, background: "#0a0a0a", borderRadius: 12 }}
      >
        {gridlines.map((yds) => {
          const p = yardsToPixels({ carryYds: yds, offlineYds: 0 }, cfg)
          return (
            <g key={yds}>
              <line x1={0} y1={p.y} x2={widthPx} y2={p.y} stroke="#ffffff14" strokeWidth={1} />
              <text x={8} y={p.y - 4} fill="#6b7280" fontSize={11}>
                {yds}y
              </text>
            </g>
          )
        })}

        <line x1={tee.x} y1={0} x2={tee.x} y2={heightPx} stroke="#ffffff1f" strokeDasharray="4 4" strokeWidth={1} />

        {series.map((s) => (
          <g key={s.key}>
            {s.shots.map((shot, i) => {
              const p = yardsToPixels(shot, cfg)
              const r = s.markerRadius ?? 2.5
              if (s.markerShape === "cross") {
                return (
                  <g key={i} stroke={s.color} strokeWidth={1.4} opacity={0.85}>
                    <line x1={p.x - r} y1={p.y - r} x2={p.x + r} y2={p.y + r} />
                    <line x1={p.x - r} y1={p.y + r} x2={p.x + r} y2={p.y - r} />
                  </g>
                )
              }
              return <circle key={i} cx={p.x} cy={p.y} r={r} fill={s.color} fillOpacity={0.65} />
            })}
          </g>
        ))}

        <rect x={tee.x - 5} y={tee.y - 5} width={10} height={10} fill="#ffffff" />
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color, borderRadius: s.markerShape === "cross" ? 2 : 999 }}
            />
            {s.label} ({s.shots.length})
          </span>
        ))}
      </div>
    </div>
  )
}
