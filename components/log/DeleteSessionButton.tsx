"use client"

import { useState, useTransition } from "react"
import { deleteSession } from "@/app/log/actions"

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#6b7280]">Delete?</span>
        <button
          onClick={() =>
            startTransition(async () => {
              await deleteSession(sessionId)
            })
          }
          disabled={isPending}
          className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {isPending ? "…" : "Yes"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-[#6b7280] hover:text-white"
        >
          No
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs text-[#6b7280] hover:text-red-400 transition-colors"
    >
      delete
    </button>
  )
}
