"use client"

import { useState, useTransition } from "react"
import { deleteSession } from "@/app/log/actions"

interface Props {
  sessionId: string
  redirectTo?: string
}

export function DeleteSessionButton({ sessionId, redirectTo }: Props) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Delete?</span>
        <button
          onClick={() =>
            startTransition(async () => {
              await deleteSession(sessionId, redirectTo)
            })
          }
          disabled={isPending}
          className="text-xs font-medium text-danger hover:text-danger disabled:opacity-50"
        >
          {isPending ? "…" : "Yes"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-muted hover:text-fg"
        >
          No
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs text-muted hover:text-danger transition-colors"
    >
      delete
    </button>
  )
}
