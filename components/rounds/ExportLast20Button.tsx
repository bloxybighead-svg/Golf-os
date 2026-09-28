"use client"

import { Download } from "lucide-react"
import type { Round } from "@/lib/supabase/types"
import { toCSV, downloadCSV } from "@/lib/csv"

// Exports the most recent 20 rounds (list arrives date-descending from the page)
export function ExportLast20Button({ rounds }: { rounds: Round[] }) {
  const last20 = rounds.slice(0, 20)

  return (
    <button
      onClick={() => {
        const stamp = new Date().toISOString().split("T")[0]
        downloadCSV(`golf-os-last-20-rounds-${stamp}.csv`, toCSV(last20 as unknown as Record<string, unknown>[]))
      }}
      disabled={last20.length === 0}
      className="flex items-center gap-1.5 rounded-lg border border-fg/[0.08] bg-surface-3 px-4 py-2 text-xs font-medium text-fg-3 transition-colors hover:text-fg hover:border-fg/20 disabled:opacity-30"
    >
      <Download size={13} />
      Export Last 20
    </button>
  )
}
