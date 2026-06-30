"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function deleteSession(sessionId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from("practice_sessions")
    .delete()
    .eq("id", sessionId)

  if (error) throw new Error(error.message)
  revalidatePath("/log")
}
