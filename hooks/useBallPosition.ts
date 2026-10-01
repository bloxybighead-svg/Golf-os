"use client"

// Where the ball is on the Play map: placed by hand, or from GPS -- one-tap "My
// location", or following you as you walk, only on readings worth trusting
// (lib/course/gps.ts). Moved verbatim from CourseMapClient.tsx.

import { useEffect, useRef, useState } from "react"
import type { LatLng } from "@/lib/course/geo"
import { EMPTY_TRACK, judgeFix, type GpsFix, type GpsTrack } from "@/lib/course/gps"
import { boundsOf } from "@/lib/planner/geometry"

const YD_PER_M = 1.09361

type Fit = { bounds: [[number, number], [number, number]] | null; key: string }

export function useBallPosition({
  setClubChoice,
  setFit,
}: {
  setClubChoice: (club: string) => void
  setFit: (fit: Fit) => void
}) {
  const [ball, setBall] = useState<LatLng | null>(null)
  const [following, setFollowing] = useState(false)
  const [gpsAccuracyYds, setGpsAccuracyYds] = useState<number | null>(null)
  const watchId = useRef<number | null>(null)
  const lastFollowAt = useRef(0)
  const [gpsError, setGpsError] = useState("")
  // Why the last GPS reading didn't move the ball (weak signal, or a jump), until one does.
  const [gpsNote, setGpsNote] = useState("")
  const gpsTrack = useRef<GpsTrack>(EMPTY_TRACK) // the readings that moved the ball while following, for judging the next

  // Stop GPS following when leaving the page.
  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  function stopFollowing() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setFollowing(false)
    setGpsAccuracyYds(null)
    setGpsNote("")
    gpsTrack.current = EMPTY_TRACK
  }

  function fixFrom(pos: GeolocationPosition): GpsFix {
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyYds: Math.round(pos.coords.accuracy * YD_PER_M),
      t: pos.timestamp || Date.now(),
    }
  }

  // Every ball move asks for the best club again; a club picked to check its
  // numbers only holds until the ball moves.
  function moveBallTo(p: LatLng) {
    setBall(p)
    setClubChoice("auto")
  }

  // Keeps the ball on your live GPS position (about every 2.5 s) so the yardages
  // update as you walk -- but only on readings worth trusting (lib/course/gps.ts):
  // within 20 yd, and no faster than a cart could have taken you there.
  function toggleFollow() {
    if (following) {
      stopFollowing()
      return
    }
    setGpsError("")
    setGpsNote("")
    if (!navigator.geolocation) {
      setGpsError("This browser has no location access.")
      return
    }
    gpsTrack.current = EMPTY_TRACK
    setFollowing(true)
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastFollowAt.current < 2500) return
        const next = fixFrom(pos)
        setGpsAccuracyYds(next.accuracyYds)
        const { verdict, track } = judgeFix(gpsTrack.current, next)
        gpsTrack.current = track
        if (verdict === "inaccurate") {
          setGpsNote(`Weak GPS signal (±${next.accuracyYds} yd). Ball not moved.`)
          return
        }
        if (verdict === "jump") {
          setGpsNote("GPS jumped. Ball not moved until it settles.")
          return
        }
        lastFollowAt.current = now
        setGpsNote("")
        moveBallTo({ lat: next.lat, lng: next.lng })
      },
      (err) => {
        setGpsError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.")
        stopFollowing()
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    )
  }

  // One tap: waits up to 10 s for a reading within 20 yd (the first one a
  // phone reports is often a coarse guess), then moves the ball there once.
  function useMyLocation(pin: LatLng | null) {
    setGpsError("")
    setGpsNote("")
    if (!navigator.geolocation) {
      setGpsError("This browser has no location access.")
      return
    }
    let best: GpsFix | null = null
    let done = false
    const finish = (id: number) => {
      done = true
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (done) return
        const next = fixFrom(pos)
        if (!best || next.accuracyYds < best.accuracyYds) best = next
        if (judgeFix(EMPTY_TRACK, next).verdict !== "accept") {
          setGpsNote(`Finding you… ±${next.accuracyYds} yd so far.`)
          return
        }
        finish(id)
        setGpsNote("")
        const p = { lat: next.lat, lng: next.lng }
        moveBallTo(p)
        setFit({ bounds: boundsOf([p, ...(pin ? [pin] : [])]), key: `gps-${Date.now()}` })
      },
      (err) => {
        if (done) return
        finish(id)
        setGpsNote("")
        setGpsError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.")
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
    const timer = setTimeout(() => {
      if (done) return
      finish(id)
      setGpsNote(
        best
          ? `Weak GPS signal (±${best.accuracyYds} yd). Ball not moved; tap the map to place it.`
          : "No GPS fix yet. Tap the map to place the ball."
      )
    }, 10000)
  }

  return { ball, setBall, following, gpsAccuracyYds, gpsError, gpsNote, stopFollowing, moveBallTo, toggleFollow, useMyLocation }
}
