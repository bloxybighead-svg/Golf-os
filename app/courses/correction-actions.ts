"use server"

// Hole corrections are written here, on the server, with the signed-in golfer's own session.
// The browser never writes to course_corrections: the user id comes from the session (never
// from the request), values are validated against the cached course data, and row-level
// security still limits every write to rows the user owns.

import { createClient } from "@/lib/supabase/server"
import { courseKey, readCachedGeometry } from "@/lib/supabase/courseCache"
import { validateCorrection, type CorrectionInput } from "@/lib/course/corrections"
import type { CorrectableField } from "@/lib/course/overpass"

export interface SubmitCorrectionInput {
  courseId: string
  holeId: string
  par?: number
  teeLat?: number
  teeLng?: number
  yardageYds?: number
  strokeIndex?: number
  reason?: string
}

export type SubmitCorrectionResult =
  | { ok: true; saved: { hole_id: string; field_name: CorrectableField; corrected_value: string }[] }
  | { ok: false; error: string }

export async function submitCorrection(input: SubmitCorrectionInput): Promise<SubmitCorrectionResult> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Sign in to submit a correction." }

  const key = courseKey(typeof input?.courseId === "string" ? input.courseId : null)
  if (!key || typeof input.holeId !== "string") return { ok: false, error: "Course not found." }
  const geometry = await readCachedGeometry(key)
  const hole = geometry?.holes.find((h) => h.id === input.holeId)
  if (!geometry || !hole) return { ok: false, error: "Course or hole not found. Reload the course and try again." }

  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? undefined : NaN)
  const fields: CorrectionInput = {
    par: num(input.par),
    teeLat: num(input.teeLat),
    teeLng: num(input.teeLng),
    yardageYds: num(input.yardageYds),
    strokeIndex: num(input.strokeIndex),
    reason: typeof input.reason === "string" ? input.reason.trim() : undefined,
  }
  const errors = validateCorrection(fields, hole.line[0])
  const firstError = Object.values(errors)[0]
  if (firstError) return { ok: false, error: firstError }

  // What the course data says now, recorded as original_value (never taken from the client).
  const entries: [CorrectableField, string | null, number | undefined][] = [
    ["par", hole.par != null ? String(hole.par) : null, fields.par],
    ["tee_lat", String(hole.line[0].lat), fields.teeLat],
    ["tee_lng", String(hole.line[0].lng), fields.teeLng],
    ["yardage", hole.yardageYds != null ? String(hole.yardageYds) : null, fields.yardageYds],
    ["handicap", hole.strokeIndex != null ? String(hole.strokeIndex) : null, fields.strokeIndex],
  ]
  const now = new Date().toISOString()
  const rows = entries
    .filter((e): e is [CorrectableField, string | null, number] => e[2] != null)
    .map(([field_name, original_value, value]) => ({
      course_key: key,
      hole_id: hole.id,
      field_name,
      original_value,
      corrected_value: String(value),
      reason: fields.reason ? fields.reason : null,
      user_id: user.id,
      updated_at: now,
    }))
  if (rows.length === 0) return { ok: false, error: "Nothing to change." }

  const { error } = await supabase
    .from("course_corrections")
    .upsert(rows, { onConflict: "course_key,hole_id,field_name,user_id" })
  if (error) return { ok: false, error: "Could not save the correction. Try again." }
  return {
    ok: true,
    saved: rows.map((r) => ({ hole_id: r.hole_id, field_name: r.field_name, corrected_value: r.corrected_value })),
  }
}
