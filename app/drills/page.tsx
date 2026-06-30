import { createClient } from "@/lib/supabase/server"
import { DrillsClient } from "@/components/drills/DrillsClient"
import type { Drill } from "@/lib/supabase/types"

export default async function DrillsPage() {
  const supabase = createClient()

  const { data: drills, error } = await supabase
    .from("drills")
    .select("*")
    .order("category")
    .order("name")

  if (error) {
    return (
      <div className="mx-auto max-w-lg pt-4">
        <div className="rounded-md border border-yellow-800 bg-yellow-950/40 px-4 py-3 text-xs text-yellow-400">
          <p className="font-medium">Supabase not connected</p>
          <p className="mt-0.5 text-yellow-600">Run the schema SQL and check your .env.local keys.</p>
        </div>
      </div>
    )
  }

  // Count how many times each drill has been used across all session blocks.
  // Activities are stored as JSONB: [{drill_id, drill_name, ...}]
  const { data: blocks } = await supabase
    .from("session_blocks")
    .select("activities")

  const usageCounts: Record<string, number> = {}
  for (const block of blocks ?? []) {
    const activities = (block.activities ?? []) as { drill_id: string | null }[]
    for (const act of activities) {
      if (act.drill_id) {
        usageCounts[act.drill_id] = (usageCounts[act.drill_id] ?? 0) + 1
      }
    }
  }

  return (
    <div className="pt-4">
      <DrillsClient drills={(drills ?? []) as Drill[]} usageCounts={usageCounts} />
    </div>
  )
}
