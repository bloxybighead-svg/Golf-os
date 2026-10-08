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
  const [localOnlyZones, setLocalOnlyZones] = useState<UserZone[] | null>(null) // marks made before signing in
  const [syncingZones, setSyncingZones] = useState(false)
  const [drawKind, setDrawKind] = useState<Lie | null>(null)
  const [pendingPoints, setPendingPoints] = useState<LatLng[]>([])

  // Save hand-marked zones for the loaded course whenever they change (guest/offline
  // fallback -- while signed in, marks are already the source of truth in Supabase,
  // but keeping a local mirror costs nothing and covers a failed write).
  useEffect(() => {
    if (!course) return
    saveZones(course.id, zones)
  }, [course, zones])

  // Loads hand-marked zones for a course: from the signed-in user's account if
  // there is one, otherwise from this browser's local storage. If the account
  // has none yet but this browser does (marks made before signing in, or on a
  // guest session), those are offered for one-time upload rather than silently
  // dropped or silently merged.
  async function loadZonesFor(c: CourseHit) {
    const local = loadZones(c.id)
    if (authUser) {
      const { data, error } = await supabase.from("course_zones").select("id, lie, ring").eq("course_id", c.id)
      if (!error && data) {
        const remote = data as { id: string; lie: Lie; ring: LatLng[] }[]
        setZones(remote)
        setLocalOnlyZones(remote.length === 0 && local.length > 0 ? local : null)
        return
      }
      // Read failed (offline, RLS hiccup, ...): fall back to the local copy rather than showing nothing.
    }
    setZones(local)
    setLocalOnlyZones(null)
  }

  async function syncLocalZonesToAccount() {
    if (!authUser || !course || !localOnlyZones || localOnlyZones.length === 0) return
    setSyncingZones(true)
    try {
      const rows = localOnlyZones.map((z) => ({ user_id: authUser.id, course_id: course.id, lie: z.lie, ring: z.ring }))
      const { data, error } = await supabase.from("course_zones").insert(rows).select("id, lie, ring")
      if (!error && data) {
        setZones(data as { id: string; lie: Lie; ring: LatLng[] }[])
        setLocalOnlyZones(null)
        saveZones(course.id, []) // now that the account has them, this browser doesn't need its own copy
      }
    } finally {
      setSyncingZones(false)
    }
  }

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
  }
  async function deleteZone(id: string) {
    setZones((prev) => prev.filter((z) => z.id !== id)) // optimistic
    // supabase-js query builders are lazy thenables -- they only actually send the
    // request once awaited/`.then()`-ed, so this must be awaited, not just built.
    if (authUser) await supabase.from("course_zones").delete().eq("id", id)
  }

  return {
    zones,
    noHazard,
    setNoHazard,
    localOnlyZones,
    setLocalOnlyZones,
    syncingZones,
    drawKind,
    setDrawKind,
    pendingPoints,
    setPendingPoints,
    loadZonesFor,
    syncLocalZonesToAccount,
    setHazardConfirmed,
    startDraw,
    addDrawPoint,
    undoDrawPoint,
    cancelDraw,
    finishDraw,
    deleteZone,
  }
}
