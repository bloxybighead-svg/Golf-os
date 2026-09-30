// How trustworthy a hole's mapped geometry is, and a fallback to use when it
// isn't. Sparse OpenStreetMap coverage (e.g. a course with only a few holes'
// fairways traced) otherwise silently counts everything as rough, which
// quietly skews club/aim recommendations toward "avoid the rough" without
// the golfer knowing anything is missing.

import { bearingDeg, distanceYds, fromLocal, ringCentroid, type LatLng } from "./geo"
import { projectOnLine } from "./aim"
import type { CourseFeature, CourseGeometry, CourseHole } from "./overpass"
import type { Lie, UserZone } from "./lies"

export type SurfaceStatus = "mapped" | "hand-drawn" | "estimated" | "missing" | "confirmed-absent"

export interface HoleDataQuality {
  fairway: SurfaceStatus
  greens: SurfaceStatus
  bunkers: SurfaceStatus
  water: SurfaceStatus
}

/** Hazards a golfer can confirm are genuinely absent from a hole (every hole has
 * SOME fairway and green, so those aren't offered -- only bunkers and water can
 * legitimately not exist). */
export type ConfirmableHazard = "bunkers" | "water"

/**
 * Downgrades a "missing" hazard to "confirmed-absent" wherever the golfer has
 * said so -- most holes have no water and no bunkers at all, so flagging
 * every one of them as unmapped/needs-marking is just noise; this lets the
 * golfer say "there's really nothing here" once and stop being asked.
 */
export function applyConfirmedAbsent(
  quality: HoleDataQuality,
  confirmed: Partial<Record<ConfirmableHazard, boolean>>
): HoleDataQuality {
  const result = { ...quality }
  for (const key of ["bunkers", "water"] as ConfirmableHazard[]) {
    if (confirmed[key] && result[key] === "missing") result[key] = "confirmed-absent"
  }
  return result
}

// How close a feature/zone vertex needs to be to a hole's centerline (or, for
// greens, to its end point) to count as belonging to that hole, not a
// neighbouring one. Matches the threshold `defaultTeeAim` already uses for
// "does this fairway belong to this hole".
const NEAR_LINE_YDS = 45
const GREEN_NEAR_END_YDS = 60 // same threshold CourseMapClient's holePinFor uses

function ringNearLine(line: LatLng[], ring: LatLng[], nearYds: number): boolean {
  return ring.some((v) => projectOnLine(line, v).off < nearYds)
}

function greenNearHoleEnd(hole: CourseHole, features: CourseFeature[]): boolean {
  const end = hole.line[hole.line.length - 1]
  return features.some((f) => f.kind === "green" && distanceYds(ringCentroid(f.ring), end) < GREEN_NEAR_END_YDS)
}

/** Mapped in OSM, hand-drawn by the golfer, algorithmically estimated, or missing entirely. */
export function assessHoleDataQuality(hole: CourseHole, features: CourseFeature[], zones: UserZone[]): HoleDataQuality {
  const checkAlongLine = (kind: CourseFeature["kind"], lie: Lie, allowEstimate: boolean): SurfaceStatus => {
    if (features.some((f) => f.kind === kind && ringNearLine(hole.line, f.ring, NEAR_LINE_YDS))) return "mapped"
    if (zones.some((z) => z.lie === lie && ringNearLine(hole.line, z.ring, NEAR_LINE_YDS))) return "hand-drawn"
    return allowEstimate ? "estimated" : "missing"
  }
  return {
    fairway: checkAlongLine("fairway", "fairway", true),
    greens: greenNearHoleEnd(hole, features)
      ? "mapped"
      : zones.some((z) => z.lie === "green" && ringNearLine(hole.line, z.ring, NEAR_LINE_YDS))
        ? "hand-drawn"
        : "missing",
    bunkers: checkAlongLine("bunker", "bunker", false),
    water: checkAlongLine("water", "water", false),
  }
}

/**
 * Whether the course boundary is mapped. Course-wide, not per hole: without
 * it nothing counts as out of bounds except buildings, roads, driving ranges
 * and the golfer's own marks.
 */
export function boundaryStatus(geometry: Pick<CourseGeometry, "boundary"> | null): "mapped" | "missing" {
  return geometry?.boundary && geometry.boundary.outer.length > 0 ? "mapped" : "missing"
}

const FALLBACK_WIDTH_YDS = 32 // middle of the spec's "30-35 yards wide" range

/**
 * A straight corridor from tee to pin, used only when no fairway is mapped
 * or hand-drawn for this hole -- a low-confidence placeholder (always
 * reported as "estimated", never "mapped") so club/aim scoring has *some*
 * fairway to work with instead of treating the whole hole as rough. Doesn't
 * follow a dogleg's bend; a hand-drawn or OSM fairway always overrides it.
 */
export function estimatedFairwayCorridor(hole: CourseHole, pin: LatLng, widthYds = FALLBACK_WIDTH_YDS): CourseFeature {
  const start = hole.line[0]
  const end = pin
  const brg = bearingDeg(start, end)
  const perpRad = ((brg + 90) * Math.PI) / 180
  const halfW = widthYds / 2
  const offset = (p: LatLng, sign: number): LatLng =>
    fromLocal(p, { x: Math.sin(perpRad) * halfW * sign, y: Math.cos(perpRad) * halfW * sign })
  return {
    kind: "fairway",
    ring: [offset(start, -1), offset(end, -1), offset(end, 1), offset(start, 1)],
  }
}
