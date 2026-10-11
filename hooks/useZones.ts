"use client"

// Areas the golfer marks by hand on the Play map (trees, water, out of bounds,
// a safe patch...), the "none here" confirmations for missing hazards, and the
// tap-to-outline drawing (moved verbatim from CourseMapClient.tsx). Signed in,
// marks live in Supabase (course_zones); otherwise on this device.

import { useEffect, useState } from "react"
import type { createClient } from "@/lib/supabase/client"
import type { LatLng } from "@/lib/course/geo"
import type { Lie, UserZone } from "@/lib/course/lies"
import type { CourseHole } from "@/lib/course/overpass"
import type { ConfirmableHazard } from "@/lib/course/dataQuality"
import { loadZones, saveNoHazard, saveZones, type CourseHit, type NoHazardMap } from "@/lib/planner/storage"
import type { AuthUser } from "./useAuthUser"

/** Two marks are the same mark when they have the same kind and outline. */
function zoneKey(z: { lie: Lie; ring: LatLng[] }) {
  return `${z.lie}:${z.ring.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(";")}`
}

export function useZones({
  supabase,
  authUser,
  course,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  authUser: AuthUser | null
  course: CourseHit | null
}) {
  const [zones, setZones] = useState<UserZone[]>([])
  const [noHazard, setNoHazard] = useState<NoHazardMap>({})
  const [drawKind, setDrawKind] = useState<Lie | null>(null)
  const [pendingPoints, setPendingPoints] = useState<LatLng[]>([])

  // Loads the course's hand-marked zones whenever the course or the signed-in user changes
  // (sign-in resolves after the course loads, so this must not be a one-shot call). Signed
  // in: the account's marks, plus any marks this device made as a guest, which are uploaded
  // once and then removed from this device. Signed out: this device's marks.
  const courseId = course?.id
  const userId = authUser?.id
  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    async function load(id: string) {
      const local = loadZones(id)
      if (!userId) {
        setZones(local)
        return
      }
      const { data, error } = await supabase.from("course_zones").select("id, lie, ring").eq("course_id", id)
      if (cancelled) return
      if (error || !data) {
        setZones(local) // offline or refused: show this device's copy rather than nothing
        return
      }
      let all = data as { id: string; lie: Lie; ring: LatLng[] }[]
      const have = new Set(all.map(zoneKey))
      const fresh = local.filter((z) => !have.has(zoneKey(z)))
      if (fresh.length > 0) {
        const rows = fresh.map((z) => ({ user_id: userId, course_id: id, lie: z.lie, ring: z.ring }))
        const { data: added, error: addError } = await supabase.from("course_zones").insert(rows).select("id, lie, ring")
        if (cancelled) return
        if (addError || !added) {
          setZones([...all, ...fresh]) // not uploaded: keep them here and try again next load
          return
        }
        all = [...all, ...(added as { id: string; lie: Lie; ring: LatLng[] }[])]
      }
      if (local.length > 0) saveZones(id, [])
      setZones(all)
    }
    void load(courseId)
    return () => {
      cancelled = true
    }
  }, [supabase, courseId, userId])

  function setHazardConfirmed(hazard: ConfirmableHazard, value: boolean, hole: CourseHole | null) {
    if (!hole || !course) return
    setNoHazard((prev) => {
      const next = { ...prev, [hole.id]: { ...prev[hole.id], [hazard]: value } }
      saveNoHazard(course.id, next)
      return next
    })
  }

  // ---------- hand-marking trees / water / OB / etc that aren't on the map ----------
  function startDraw(lie: Lie) {
    setDrawKind(lie)
    setPendingPoints([])
  }
  function addDrawPoint(p: LatLng) {
    setPendingPoints((prev) => [...prev, p])
  }
  function undoDrawPoint() {
    setPendingPoints((prev) => prev.slice(0, -1))
  }
  function cancelDraw() {
    setDrawKind(null)
    setPendingPoints([])
  }
  async function finishDraw() {
    if (!drawKind || pendingPoints.length < 3) return
    const lie = drawKind
    const ring = pendingPoints
    setDrawKind(null)
    setPendingPoints([])
    if (authUser && course) {
      const { data, error } = await supabase
        .from("course_zones")
        .insert({ user_id: authUser.id, course_id: course.id, lie, ring })
        .select("id, lie, ring")
        .single()
      if (!error && data) {
        setZones((prev) => [...prev, data as { id: string; lie: Lie; ring: LatLng[] }])
        return
      }
      // Write failed (offline, etc): still keep the mark locally rather than lose it.
    }
    const zone: UserZone = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, lie, ring }
    setZones((prev) => [...prev, zone])
    if (course) saveZones(course.id, [...loadZones(course.id), zone]) // this device keeps it until it can be uploaded
  }
  async function deleteZone(id: string) {
    setZones((prev) => prev.filter((z) => z.id !== id)) // optimistic
    // supabase-js query builders are lazy thenables -- they only actually send the
    // request once awaited/`.then()`-ed, so this must be awaited, not just built.
    if (authUser) await supabase.from("course_zones").delete().eq("id", id)
    if (course) saveZones(course.id, loadZones(course.id).filter((z) => z.id !== id))
  }

  return {
    zones,
    noHazard,
    setNoHazard,
    drawKind,
    setDrawKind,
    pendingPoints,
    setPendingPoints,
    setHazardConfirmed,
    startDraw,
    addDrawPoint,
    undoDrawPoint,
    cancelDraw,
    finishDraw,
    deleteZone,
  }
}
