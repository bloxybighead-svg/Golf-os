"use client"

import { useSyncStatus } from "@/hooks/useSyncStatus"

/**
 * One quiet line: "Saved on phone · will sync" while a finished round waits to reach
 * the account, "Synced" once it has. Nothing when there is nothing to say. Plain text
 * rather than a filled pill: DESIGN.md keeps pills out of the yardage-book look.
 */
export function SyncStatus({ className = "" }: { className?: string }) {
  const { state, online, needsSignIn } = useSyncStatus()
  if (state === "idle") return null
  const text =
    state === "synced"
      ? "Synced"
      : state === "blocked"
        ? needsSignIn
          ? "Saved on phone · sign in to sync"
          : "Saved on phone · couldn't sync"
        : online
          ? "Saved on phone · will sync"
          : "Saved on phone · will sync when online"
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${state === "synced" ? "text-accent" : "text-fg-3"} ${className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${state === "synced" ? "bg-accent" : state === "blocked" ? "bg-warn" : "bg-fg-3"}`} />
      {text}
    </span>
  )
}
