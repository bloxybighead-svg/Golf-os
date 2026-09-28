"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Pages that only show the signed-in golfer's own records. Play works without
// an account, and You carries its own sign-in card, so neither needs this.
const ACCOUNT_PAGES = ["/rounds", "/log"]

// The one sign-in prompt, rendered from the root layout rather than repeated per page.
export function SignInBanner({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()
  if (signedIn || !ACCOUNT_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-fg/[0.08] bg-surface px-4 py-3">
      <p className="text-sm text-fg">Sign in to save your rounds.</p>
      <Link href="/login" className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110">
        Sign in
      </Link>
    </div>
  )
}
