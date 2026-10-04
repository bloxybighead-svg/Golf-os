"use client"

import { SyncStatus } from "@/components/pwa/SyncStatus"
import { useSyncStatus } from "@/hooks/useSyncStatus"

/**
 * Offline and sync, from Session 15: rounds finished without signal wait on the
 * phone and send themselves when it is back. Always says something, unlike the
 * SyncStatus line that stays quiet when there is nothing to report.
 */
export function SyncSetting({ signedIn }: { signedIn: boolean }) {
  const { state, online } = useSyncStatus()
  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <p className="label-xs">Sync</p>
      <div className="mt-1 min-h-[1.25rem]">
        {state === "idle" ? (
          <p className="text-xs text-fg-3">
            {!online
              ? "Offline. Rounds you finish are kept on this phone."
              : signedIn
                ? "Nothing waiting. Everything is saved to your account."
                : "Sign in to save rounds to your account."}
          </p>
        ) : (
          <SyncStatus />
        )}
      </div>
    </div>
  )
}
