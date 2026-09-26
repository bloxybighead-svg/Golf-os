"use client"

import { yardsToPixels, type TransformConfig } from "@/lib/dispersion/transform"
import { pointInPolygon, type YardPolygonPoint } from "@/lib/dispersion/polygon"

export interface DispersionShot {
  carryYds: number
  offlineYds: number
  isMishit?: boolean
}

interface Props {
  shots: DispersionShot[]
  fairway: YardPolygonPoint[]
  widthPx?: number
  maxHeightPx?: number // ceiling on the canvas height, not a fixed value -- see layout()
  minCarryYds?: number // bottom of the visible window; default 0 (the tee)
  maxCarryYds: number // top of the visible window; also sets the scale
  widthYds: number // full left-right span shown, centered on 0
}

const MARGIN = 20
const MIN_HEIGHT_PX = 320

// Every yards<->pixels conversion in this component funnels through this
// one TransformConfig so the origin/scale are defined in exactly one
// place, per the "explicit coordinate transform" requirement.
//
// The canvas height is DERIVED from the data's aspect ratio, not a fixed
// number: picking one shared scale for both axes (so dispersion shape
// isn't visually stretched) while ALSO fixing both width and height
// independently means whichever axis is over-provisioned relative to its
// own yard-span just sits empty -- for Driver's wide offline spread vs a
// tightly-windowed carry span, that left most of a fixed 720px-tall
// canvas blank, with all the content crammed into a small band. Instead:
// start from the scale that exactly fills the width, size the height to
// exactly match what that scale needs, and only clamp if that height
// would be unreasonably tall/short -- any leftover slack from clamping
// gets centered instead of dumped on one side.
function layout(widthPx: number, maxHeightPx: number, minCarryYds: number, maxCarryYds: number, widthYds: number) {
  const carrySpan = Math.max(maxCarryYds - minCarryYds, 1)
  const idealScale = widthPx / widthYds
  let heightPx = carrySpan * idealScale + MARGIN * 2
  let scale = idealScale
  if (heightPx > maxHeightPx) {
    heightPx = maxHeightPx
    scale = (heightPx - MARGIN * 2) / carrySpan // now < idealScale; leaves centered horizontal padding
  } else if (heightPx < MIN_HEIGHT_PX) {
    heightPx = MIN_HEIGHT_PX // keep scale as-is; leaves centered vertical padding, computed below
  }
  const usedContentHeight = carrySpan * scale
  const verticalPadding = (heightPx - usedContentHeight) / 2
  // Solve for the origin (carry = 0) pixel-y from "carry = minCarryYds lands at heightPx - verticalPadding":
  const originY = heightPx - verticalPadding + minCarryYds * scale
  return { heightPx, cfg: { originX: widthPx / 2, originY, scale } as TransformConfig }
}

export function DispersionCanvas({
  shots,
  fairway,
  widthPx = 640,
  maxHeightPx = 640,
  minCarryYds = 0,
  maxCarryYds,
  widthYds,
}: Props) {
  const { heightPx, cfg } = layout(widthPx, maxHeightPx, minCarryYds, maxCarryYds, widthYds)
  const fairwayPx = fairway.map((p) => yardsToPixels({ carryYds: p.carryYds, offlineYds: p.offlineYds }, cfg))
  const fairwayPath = fairwayPx.map((p) => `${p.x},${p.y}`).join(" ")
  const tee = yardsToPixels({ carryYds: 0, offlineYds: 0 }, cfg)

  // Aim for roughly 5 gridlines across whatever window is visible, snapped
  // to a "nice" step, instead of a fixed 50y step that shows zero or one
  // gridline once the window is zoomed in on a short club.
  const NICE_STEPS = [5, 10, 25, 50, 100]
  const rawStep = (maxCarryYds - minCarryYds) / 5
  const gridlineStepYds = NICE_STEPS.find((s) => s >= rawStep) ?? 100
  const firstGridline = Math.ceil(minCarryYds / gridlineStepYds) * gridlineStepYds
  const gridlines: number[] = []
  for (let y = firstGridline; y <= maxCarryYds; y += gridlineStepYds) gridlines.push(y)

  const insideCount = shots.filter((s) => pointInPolygon(s, fairway)).length

  return (
    <div>
      <svg
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        width="100%"
        style={{ maxWidth: widthPx, background: "#0a0a0a", borderRadius: 12 }}
      >
        {/* yardage gridlines */}
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

        {/* center line */}
        <line
          x1={tee.x}
          y1={0}
          x2={tee.x}
          y2={heightPx}
          stroke="#ffffff1f"
          strokeDasharray="4 4"
          strokeWidth={1}
        />

        {/* fairway/target polygon */}
        <polygon points={fairwayPath} fill="#22c55e1a" stroke="#22c55e88" strokeWidth={2} />

        {/* shots */}
        {shots.map((s, i) => {
          const p = yardsToPixels({ carryYds: s.carryYds, offlineYds: s.offlineYds }, cfg)
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={s.isMishit ? 3.5 : 2.5}
              fill={s.isMishit ? "#f97316" : "#38bdf8"}
              fillOpacity={0.75}
            />
          )
        })}

        {/* tee marker */}
        <rect x={tee.x - 5} y={tee.y - 5} width={10} height={10} fill="#ffffff" />
      </svg>

      <p className="mt-2 text-xs text-[#6b7280]">
        {insideCount} / {shots.length} shots landed inside the shaded area (
        {shots.length > 0 ? Math.round((insideCount / shots.length) * 100) : 0}%)
      </p>
    </div>
  )
}
