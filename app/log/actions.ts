"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

import type { ClubWorkEntry } from "@/lib/supabase/types"

export async function updateClubWork(sessionId: string, clubWork: ClubWorkEntry[]) {
  const supabase = createClient()
  const { error } = await supabase
    .from("practice_sessions")
    .update({ club_work: clubWork })
    .eq("id", sessionId)
  if (error) throw new Error(error.message)
  revalidatePath(`/log/${sessionId}`)
}

export async function deleteSession(sessionId: string, redirectTo?: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from("practice_sessions")
    .delete()
    .eq("id", sessionId)

  if (error) throw new Error(error.message)
  revalidatePath("/log")
  if (redirectTo) redirect(redirectTo)
}
