"use client"

import { useState } from "react"
import type { SessionBlock, BlockType, Drill } from "@/lib/supabase/types"
import { ClubPicker } from "./ClubPicker"
import { ActivityList } from "./ActivityList"
import { RatingDots } from "./RatingDots"

const BLOCK_TYPES: BlockType[] = [
  "Full Swing",
  "Wedge/Scoring Zone",
  "Chipping",
  "Bunker",
  "Putting",
]

// Clubs available per block type. Changing block type resets club selection.
const CLUBS_BY_TYPE: Record<BlockType, string[]> = {
  "Full Swing":        ["Driver", "3W", "7W", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "56", "60"],
  "Wedge/Scoring Zone":["PW", "GW", "56", "60"],
  "Chipping":          ["PW", "GW", "56", "60"],
  "Bunker":            ["56", "60"],
  "Putting":           ["Putter"],
}

// Block types where Launch Pro and distance range are irrelevant
const NO_LAUNCH_PRO: BlockType[] = ["Putting", "Chipping", "Bunker"]
const NO_DISTANCE: BlockType[] = ["Putting", "Chipping", "Bunker"]

function defaultBlock(type: BlockType): SessionBlock {
  const clubs = CLUBS_BY_TYPE[type]
  return {
    block_type: type,
    duration_minutes: null,
    activities: [],
    clubs_used: clubs.length === 1 ? clubs : [],
    shot_count: null,
    distance_range: null,
    launch_pro: false,
    quality_rating: null,
    notes: null,
  }
}

interface Props {
  drills: Drill[]
  onSave: (block: SessionBlock) => void
  onCancel: () => void
}

export function BlockForm({ drills, onSave, onCancel }: Props) {
  const [form, setForm] = useState<SessionBlock>(defaultBlock("Full Swing"))

  function set<K extends keyof SessionBlock>(key: K, val: SessionBlock[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function changeType(type: BlockType) {
    setForm(defaultBlock(type))
  }

  const showLaunchPro = !NO_LAUNCH_PRO.includes(form.block_type)
  const showDistance  = !NO_DISTANCE.includes(form.block_type)
  const availableClubs = CLUBS_BY_TYPE[form.block_type]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f0f0f]">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-[#6b7280] hover:text-white transition-colors"
        >
          Cancel
        </button>
        <span className="text-sm font-semibold text-white">Add Block</span>
        <button
          type="button"
          onClick={() => onSave(form)}
          className="text-sm font-semibold text-[#4ade80] hover:opacity-80 transition-opacity"
        >
          Save
        </button>
      </div>

      {/* Scrollable fields */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">

        {/* Block type */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">Block Type</p>
          <div className="flex flex-wrap gap-2">
            {BLOCK_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => changeType(t)}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  form.block_type === t
                    ? "border-[#4ade80] bg-[#4ade80] text-black"
                    : "border-[#2a2a2a] text-[#6b7280] hover:border-white hover:text-white",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
            Duration (min)
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={form.duration_minutes ?? ""}
            onChange={(e) => set("duration_minutes", e.target.value ? parseInt(e.target.value) : null)}
            placeholder="e.g. 45"
            className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
          />
        </div>

        {/* Activities */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">Activities</p>
          <ActivityList
            activities={form.activities}
            drills={drills}
            onChange={(v) => set("activities", v)}
          />
        </div>

        {/* Clubs — filtered by block type, hidden label if only one option */}
        <div>
          {availableClubs.length === 1 ? (
            <p className="text-xs text-[#6b7280]">
              Club: <span className="text-white">{availableClubs[0]}</span>
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">Clubs Used</p>
              <ClubPicker
                value={form.clubs_used}
                onChange={(v) => set("clubs_used", v)}
                allowedClubs={availableClubs}
              />
            </>
          )}
        </div>

        {/* Shot count + Distance range (distance hidden for short game) */}
        <div className={showDistance ? "grid grid-cols-2 gap-3" : ""}>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
              Shot Count
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={form.shot_count ?? ""}
              onChange={(e) => set("shot_count", e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g. 80"
              className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
            />
          </div>
          {showDistance && (
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
                Distance Range
              </label>
              <input
                type="text"
                value={form.distance_range ?? ""}
                onChange={(e) => set("distance_range", e.target.value || null)}
                placeholder="e.g. 30–100y"
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Launch Pro toggle — hidden for putting / chipping / bunker */}
        {showLaunchPro && (
          <button
            type="button"
            onClick={() => set("launch_pro", !form.launch_pro)}
            className="flex w-full items-center justify-between rounded-md border border-[#2a2a2a] bg-[#161616] px-4 py-3"
          >
            <div className="text-left">
              <p className="text-sm font-medium text-white">Launch Pro</p>
              <p className="text-xs text-[#6b7280]">TrackMan / FlightScope data collected</p>
            </div>
            <div
              className={[
                "relative h-6 w-11 rounded-full transition-colors",
                form.launch_pro ? "bg-[#4ade80]" : "bg-[#2a2a2a]",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  form.launch_pro ? "translate-x-5" : "translate-x-0.5",
                ].join(" ")}
              />
            </div>
          </button>
        )}

        {/* Quality rating */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">Block Quality</p>
          <RatingDots value={form.quality_rating} onChange={(v) => set("quality_rating", v)} />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
            Notes
          </label>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            placeholder="What worked, what broke down, swing thought that clicked…"
            rows={3}
            className="w-full resize-none rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
          />
        </div>

        <div className="h-8" />
      </div>
    </div>
  )
}
