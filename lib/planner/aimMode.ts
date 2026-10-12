// Who is steering the aim marker. In "auto" it sits at the chosen club's best aim and follows every new
// ranking; a drag or tap makes it "manual" until the hole, the ball, the club or the round changes.

import type { LatLng } from "@/lib/course/geo"

export type AimMode = "auto" | "manual"

export interface AimState {
  mode: AimMode
  /** The golfer's own aim; only read in manual mode. */
  point: LatLng | null
}

export type AimAction = { type: "drag"; point: LatLng } | { type: "reset" }

export const AUTO_AIM: AimState = { mode: "auto", point: null }

export function aimReducer(state: AimState, action: AimAction): AimState {
  if (action.type === "drag") return { mode: "manual", point: action.point }
  return state.mode === "auto" ? state : AUTO_AIM
}

/** The aim marker's position: the golfer's in manual, else the chosen club's best aim, else the heuristic default. */
export function aimFor(state: AimState, bestAim: LatLng | null, defaultAim: LatLng | null): LatLng | null {
  return state.mode === "manual" && state.point ? state.point : bestAim ?? defaultAim
}
