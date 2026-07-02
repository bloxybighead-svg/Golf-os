"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function createMilestone(date: string, label: string) {
  const supabase = createClient()
  const { error } = await supabase.from("milestones").insert({ date, label: label.trim() })
  if (error) throw new Error(error.message)
  revalidatePath("/trends")
}

export async function deleteMilestone(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from("milestones").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/trends")
}
