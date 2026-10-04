"use client"

// The golfer's OB tags for the open course: "OB left / right / long" from the
// hole editor and the one-tap "No OB mapped" banner. Signed in, they live in
// Supabase (hole_ob_tags); otherwise on this device, like hand-drawn marks.

import { useCallback, useEffect, useState } from "react"
import type { createClient } from "@/lib/supabase/client"
import type { ObSide, ObTag } from "@/lib/course/obTags"
import { answerBanner, loadObTags, rowsToMap, saveObTags, toggleSide, withMargin, type HoleObTags, type ObTagRow } from "@/lib/planner/obTagStore"
import type { CourseHit } from "@/lib/planner/storage"
import type { AuthUser } from "./useAuthUser"

export function useObTags({
  supabase,
  authUser,
  course,
}: {
  supabase: ReturnType<typeof createClient>
  authUser: AuthUser | null
  course: CourseHit | null
}) {
  const [map, setMap] = useState<HoleObTags>({})

  // Load whenever the course (or who is signed in) changes. A failed account read falls back to this device's copy.
  useEffect(() => {
    if (!course) {
      setMap({})
      return
    }
    const local = loadObTags(course.id)
    setMap(local)
    if (!authUser) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from("hole_ob_tags").select("hole_id, side, margin_yds").eq("course_id", course.id)
      if (cancelled || error || !data) return
      const remote = rowsToMap(data as ObTagRow[])
      // Tags made on this device before signing in are kept until the account has its own for that hole.
      setMap({ ...local, ...remote })
    })()
    return () => {
      cancelled = true
    }
  }, [course, authUser, supabase])

  const commit = useCallback(
    async (holeId: string, tags: ObTag[]) => {
      if (!course) return
      setMap((prev) => {
        const next = { ...prev }
        if (tags.length > 0) next[holeId] = tags
        else delete next[holeId]
        saveObTags(course.id, next)
        return next
      })
      if (!authUser) return
      // supabase-js builders only send once awaited.
      await supabase.from("hole_ob_tags").delete().eq("course_id", course.id).eq("hole_id", holeId)
      if (tags.length > 0) {
        await supabase.from("hole_ob_tags").insert(
          tags.map((t) => ({ user_id: authUser.id, course_id: course.id, hole_id: holeId, side: t.side, margin_yds: t.marginYds }))
        )
      }
    },
    [course, authUser, supabase]
  )

  return {
    obTagMap: map,
    tagsFor: (holeId: string | null): ObTag[] => (holeId ? map[holeId] ?? [] : []),
    toggleTag: (holeId: string, side: ObSide) => commit(holeId, toggleSide(map[holeId] ?? [], side)),
    answer: (holeId: string, a: "left" | "right" | "both" | "none") => commit(holeId, answerBanner(a, map[holeId]?.[0]?.marginYds)),
    setMargin: (holeId: string, m: number) => commit(holeId, withMargin(map[holeId] ?? [], m)),
    clearTags: (holeId: string) => commit(holeId, []),
  }
}
