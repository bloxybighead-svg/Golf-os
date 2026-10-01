"use client"

import Link from "next/link"

/** Where signing in returns to: the Rounds page with the add-round form open (the draft reloads from this device). */
export const SIGN_IN_FOR_ROUND = "/login?redirect=%2Frounds%3Fnew%3D1"

/**
 * The short "sign in to save rounds" sheet. Shown by "Add round" when signed
 * out (with "Try it without saving") and by Save in a guest's form (with
 * "Keep editing"). Either way the round draft stays in local storage.
 */
export function SignInToSave({
  onSecondary,
  secondaryLabel,
}: {
  onSecondary: () => void
  secondaryLabel: string
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center" role="dialog" aria-modal="true" aria-label="Sign in to save rounds">
      <div className="w-full max-w-sm rounded-t-2xl border border-fg/[0.08] bg-page p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-2xl">
        <p className="text-base font-semibold text-fg">Sign in to save rounds.</p>
        <p className="mt-1 text-sm text-fg-3">It takes 20 seconds. Anything you&rsquo;ve entered stays on this device.</p>
        <div className="mt-4 grid gap-2">
          <Link
            href={SIGN_IN_FOR_ROUND}
            className="flex h-11 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent hover:brightness-110"
          >
            Sign in
          </Link>
          <button
            type="button"
            onClick={onSecondary}
            className="h-11 rounded-lg border border-fg/[0.08] text-sm font-semibold text-fg-2 hover:border-fg/20 hover:text-fg"
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
