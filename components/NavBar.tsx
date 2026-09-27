"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { House, Target, Flag, Map as MapIcon } from "lucide-react"
import { AccountMenu } from "./auth/AccountMenu"

// Four main tabs. "match" lists every path prefix that keeps a tab highlighted,
// so the Practice tab stays lit on Log, Drills and Trends, and Course Planner
// stays lit on all its sub-pages.
const NAV_ITEMS = [
  { label: "Home", short: "Home", href: "/", match: [] as string[], Icon: House },
  { label: "Practice", short: "Practice", href: "/log", match: ["/log", "/drills", "/trends"], Icon: Target },
  { label: "Rounds", short: "Rounds", href: "/rounds", match: ["/rounds"], Icon: Flag },
  { label: "Course Planner", short: "Planner", href: "/planner", match: ["/planner"], Icon: MapIcon },
] as const

function isActive(pathname: string, href: string, match: readonly string[]) {
  return href === "/" ? pathname === "/" : match.some((m) => pathname === m || pathname.startsWith(m + "/"))
}

export default function NavBar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname()

  return (
    <>
      {/* Top bar: wordmark + tabs on desktop, wordmark + account only on phones (the four tabs move to the bottom, in thumb reach) */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 max-w-[1280px] items-center justify-between px-4 md:h-16 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#22c55e] text-black">
              <Flag size={15} strokeWidth={2.6} />
            </span>
            <span className="whitespace-nowrap text-sm font-bold tracking-tight text-white">
              Golf <span className="text-[#22c55e]">OS</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 md:gap-4">
            <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
              {NAV_ITEMS.map(({ label, href, match, Icon }) => {
                const active = isActive(pathname, href, match)
                return (
                  <Link key={href} href={href} className="group relative flex items-center gap-2 px-3.5 py-2">
                    <Icon size={16} className={active ? "text-[#22c55e]" : "text-[#6b7280] group-hover:text-[#d1d5db]"} />
                    <span
                      className={[
                        "whitespace-nowrap text-sm transition-colors",
                        active ? "font-semibold text-white" : "font-medium text-[#6b7280] group-hover:text-[#d1d5db]",
                      ].join(" ")}
                    >
                      {label}
                    </span>
                    <span
                      className={[
                        "absolute -bottom-[13px] left-3 right-3 h-[2px] rounded-full transition-all",
                        active ? "bg-[#22c55e] opacity-100" : "opacity-0",
                      ].join(" ")}
                    />
                  </Link>
                )
              })}
            </nav>
            <AccountMenu email={userEmail} />
          </div>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV_ITEMS.map(({ short, href, match, Icon }) => {
            const active = isActive(pathname, href, match)
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                    active ? "text-[#22c55e]" : "text-[#6b7280]"
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                  {short}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
