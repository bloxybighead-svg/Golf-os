"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

interface RoundPayload {
  date: string
  course_name: string
  score: number
  par: number
  fairways_hit: number | null
  fairways_total: number | null
  gir: number | null
  total_putts: number | null
  notes: string | null
}

export async function createRound(data: RoundPayload) {
  const supabase = createClient()
  const { error } = await supabase.from("rounds").insert(data)
  if (error) throw new Error(error.message)
  revalidatePath("/rounds")
}

export async function updateRound(id: string, data: RoundPayload) {
  const supabase = createClient()
  const { error } = await supabase.from("rounds").update(data).eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/rounds")
}

export async function deleteRound(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from("rounds").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/rounds")
}
