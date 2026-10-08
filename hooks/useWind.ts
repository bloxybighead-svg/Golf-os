"use client"

// The planner's wind and air temperature: the current reading for the course (refreshed every
// WIND_REFRESH_MS during a round), the golfer's manual setting, and which one
// applies (lib/course/wind.ts resolveWind: manual always wins). With no signal
// it keeps using the last saved reading and says when it was taken.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LatLng } from "@/lib/course/geo"
import {
  absoluteFromHole,
  clampSpeed,
  clampTemperature,
  parseWindResponse,
  resolveTemperature,
  resolveWind,
  roundWind,
  windUrl,
  WIND_REFRESH_MS,
  type ManualTemperature,
  type ManualWind,
  type ResolvedTemperature,
  type ResolvedWind,
  type WindReading,
} from "@/lib/course/wind"
import { readAutoWind, readManualTemperature, readManualWind, saveAutoWind, saveManualTemperature, saveManualWind } from "@/lib/course/windStore"

export interface WindState extends ResolvedWind {
  /** Sets the manual wind: speed 0-30 mph, and the direction as it is on the dial, relative to the hole (0 = into you). */
  setManual: (speedMph: number, relDeg: number, holeBearingDeg: number) => void
  /** Back to the automatic reading. */
  clearManual: () => void
  /** The air temperature in degrees F, and where it came from. */
  temperature: ResolvedTemperature
  /** Sets the temperature by hand, degrees F (kept within -20 to 120). */
  setManualTemperature: (temperatureF: number) => void
  /** Back to the automatic reading. */
  clearManualTemperature: () => void
}

export function useWind({ courseId, center, roundActive }: { courseId: string | null; center: LatLng | null; roundActive: boolean }): WindState {
  const [auto, setAuto] = useState<WindReading | null>(null)
  const [manual, setManualState] = useState<ManualWind | null>(null)
  const [manualTemp, setManualTempState] = useState<ManualTemperature | null>(null)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // The saved copies (this device) load after mount.
  useEffect(() => {
    setManualState(readManualWind())
    setManualTempState(readManualTemperature())
  }, [])
  useEffect(() => {
    setAuto(courseId ? readAutoWind(courseId) : null)
    setFailed(false)
  }, [courseId])

  const lat = center?.lat
  const lng = center?.lng
  const fetching = useRef(false)
  const refresh = useCallback(async () => {
    if (!courseId || lat == null || lng == null || fetching.current) return
    fetching.current = true
    try {
      const res = await fetch(windUrl(lat, lng), { cache: "no-store" })
      const reading = res.ok ? parseWindResponse(await res.json(), Date.now()) : null
      if (reading) {
        saveAutoWind(courseId, reading)
        setAuto(reading)
        setFailed(false)
      } else setFailed(true)
    } catch {
      setFailed(true) // no signal: the last reading stays in use, labelled with its time
    } finally {
      fetching.current = false
    }
  }, [courseId, lat, lng])

  // Once when the course opens; then every WIND_REFRESH_MS while a round is on.
  useEffect(() => {
    void refresh()
    if (!roundActive) return
    const t = setInterval(() => void refresh(), WIND_REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh, roundActive])

  // Coming back online fetches at once instead of waiting out the interval.
  useEffect(() => {
    const on = () => void refresh()
    window.addEventListener("online", on)
    return () => window.removeEventListener("online", on)
  }, [refresh])

  // The clock moves on so an old reading or a lapsed manual setting is noticed without a re-render trigger.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const setManual = useCallback((speedMph: number, relDeg: number, holeBearingDeg: number) => {
    const w = roundWind({ speedMph: clampSpeed(speedMph), fromDeg: absoluteFromHole(relDeg, holeBearingDeg) })
    const m: ManualWind = { ...w, at: Date.now() }
    saveManualWind(m)
    setManualState(m)
  }, [])
  const clearManual = useCallback(() => {
    saveManualWind(null)
    setManualState(null)
  }, [])

  const setManualTemperature = useCallback((temperatureF: number) => {
    const t: ManualTemperature = { temperatureF: clampTemperature(temperatureF), at: Date.now() }
    saveManualTemperature(t)
    setManualTempState(t)
  }, [])
  const clearManualTemperature = useCallback(() => {
    saveManualTemperature(null)
    setManualTempState(null)
  }, [])

  const resolved = useMemo(() => resolveWind(manual, auto, now, failed), [manual, auto, now, failed])
  // Keep the wind object's identity while its numbers are the same, so a re-render never re-ranks.
  const key = resolved.wind ? `${resolved.wind.speedMph}@${resolved.wind.fromDeg}` : "-"
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => resolved, [key, resolved.source, resolved.at, resolved.labelTime])
  const temperature = useMemo(() => resolveTemperature(manualTemp, auto, now), [manualTemp, auto, now])
  return { ...stable, setManual, clearManual, temperature, setManualTemperature, clearManualTemperature }
}
