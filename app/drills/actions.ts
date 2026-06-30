"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { DrillCategory } from "@/lib/supabase/types"

export async function createDrill(data: {
  name: string
  category: DrillCategory
  description: string
  target_metric: string
}) {
  const supabase = createClient()
  const { error } = await supabase.from("drills").insert(data)
  if (error) throw new Error(error.message)
  revalidatePath("/drills")
}

export async function updateDrill(
  id: string,
  data: { name: string; category: DrillCategory; description: string; target_metric: string }
) {
  const supabase = createClient()
  const { error } = await supabase.from("drills").update(data).eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/drills")
}

export async function deleteDrill(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from("drills").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/drills")
}
