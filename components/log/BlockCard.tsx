import type { SessionBlock, Drill } from "@/lib/supabase/types"

interface Props {
  block: SessionBlock
  index: number
  drills: Drill[]
  onRemove: () => void
}

export function BlockCard({ block, index, drills, onRemove }: Props) {
  const drillLabel = block.drill_id
    ? (drills.find((d) => d.id === block.drill_id)?.name ?? null)
    : block.drill_free_text

  return (
    <div className="rounded-md border border-[#2a2a2a] bg-[#161616] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 font-mono text-xs text-[#6b7280]">#{index + 1}</span>
          <span className="truncate text-sm font-medium text-white">{block.block_type}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {block.quality_rating != null && (
            <span className="text-xs font-semibold text-[#4ade80]">{block.quality_rating}/5</span>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-[#6b7280] transition-colors hover:text-red-400"
          >
            remove
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#6b7280]">
        {block.duration_minutes != null && <span>{block.duration_minutes} min</span>}
        {drillLabel && <span className="text-[#e5e5e5]">{drillLabel}</span>}
        {block.clubs_used.length > 0 && <span>{block.clubs_used.join(", ")}</span>}
        {block.shot_count != null && <span>{block.shot_count} shots</span>}
        {block.distance_range && <span>{block.distance_range}</span>}
        {block.launch_pro && <span className="text-[#4ade80]">Launch Pro</span>}
      </div>

      {block.notes && (
        <p className="mt-1.5 text-xs italic text-[#6b7280]">{block.notes}</p>
      )}
    </div>
  )
}
