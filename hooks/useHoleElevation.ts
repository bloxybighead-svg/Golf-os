"use client"

// The ground-height field for the hole on screen: from this device's saved copy,
// else /api/elevation (lib/course/elevationClient.ts). Null while it loads or when
// it can't be had; the planner then treats the ground as flat.

import { useEffect, useState } from "react"
import type { ElevationField } from "@/lib/course/elevation"
import { loadHoleElevation } from "@/lib/course/elevationClient"
import type { LatLng } from "@/lib/course/geo"

export function useHoleElevation(courseId: string | null, holeId: string | null, line: LatLng[] | null): ElevationField | null {
  const [state, setState] = useState<{ key: string; field: ElevationField | null }>({ key: "", field: null })
  const key = courseId && holeId && line && line.length >= 2 ? `${courseId}:${holeId}` : ""

  useEffect(() => {
    if (!key || !courseId || !holeId || !line) return
    const ctl = new AbortController()
    void loadHoleElevation(courseId, holeId, line, ctl.signal)
      .then((field) => setState({ key, field }))
      .catch(() => {
        /* aborted: a newer hole took over */
      })
    return () => ctl.abort()
    // The line is the hole's own geometry: its identity changes only when the hole does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state.key === key ? state.field : null
}
