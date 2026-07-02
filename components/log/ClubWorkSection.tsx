"use client"

import { useState, useTransition } from "react"
import type { ClubWorkEntry } from "@/lib/supabase/types"
import { ClubWork } from "./ClubWork"
import { updateClubWork } from "@/app/log/actions"

interface Props {
  sessionId: string
  initial: ClubWorkEntry[]
}

export function ClubWorkSection({ sessionId, initial }: Props) {
  const [entries, setEntries] = useState<ClubWorkEntry[]>(initial)
  const [saved, setSaved] = useState<ClubWorkEntry[]>(initial)
  const [isPending, startTransition] = useTransition()

  const dirty = JSON.stringify(entries) !== JSON.stringify(saved)

  function save() {
    startTransition(async () => {
      await updateClubWork(sessionId, entries)
      setSaved(entries)
    })
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Club Work</p>
          <p className="mt-0.5 text-xs text-[#6b7280]">Editable — refine these as you work on feel & consistency</p>
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={isPending}
            className="rounded-lg bg-[#22c55e] px-4 py-1.5 text-xs font-semibold text-black transition-all hover:brightness-110 disabled:opacity-40"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        )}
        {!dirty && saved.length > 0 && (
          <span className="text-xs text-[#4b5563]">Saved</span>
        )}
      </div>
      <ClubWork entries={entries} onChange={setEntries} />
    </div>
  )
}
