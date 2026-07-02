"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

interface RoundPayload {
  date: string
  holes_played: number
  course_name: string
  score: number
  par: number
  is_competitive: boolean
  course_rating: number | null
  slope_rating: number | null
  differential: number | null
  penalties: number | null
  fairways_pct: number | null
  gir_pct: number | null
  total_putts: number | null
  three_putts: number | null
  up_and_downs: number | null
  miss_left_pct: number | null
  miss_right_pct: number | null
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
