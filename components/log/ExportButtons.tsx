"use client"

import { Download } from "lucide-react"
import { toCSV, downloadCSV } from "@/lib/csv"

interface Props {
  clubWorkRows: Record<string, unknown>[]
  drillRows: Record<string, unknown>[]
}

const btnCls =
  "flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-4 py-2 text-xs font-medium text-[#9ca3af] transition-colors hover:text-white hover:border-white/20 disabled:opacity-30"

export function ExportButtons({ clubWorkRows, drillRows }: Props) {
  const stamp = () => new Date().toISOString().split("T")[0]

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => downloadCSV(`golf-os-clubwork-${stamp()}.csv`, toCSV(clubWorkRows))}
        disabled={clubWorkRows.length === 0}
        className={btnCls}
      >
        <Download size={13} />
        Export Club Work CSV
      </button>
      <button
        onClick={() => downloadCSV(`golf-os-drills-${stamp()}.csv`, toCSV(drillRows))}
        disabled={drillRows.length === 0}
        className={btnCls}
      >
        <Download size={13} />
        Export Drills CSV
      </button>
    </div>
  )
}
