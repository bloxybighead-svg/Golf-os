"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Four main tabs. "match" lists every path prefix that keeps a tab highlighted,
// so the Practice tab stays lit on Log, Drills and Trends, and Course Planner
// stays lit on all its sub-pages.
const NAV_ITEMS = [
  { label: "Home", href: "/", match: [] as string[] },
  { label: "Practice", href: "/log", match: ["/log", "/drills", "/trends"] },
  { label: "Rounds", href: "/rounds", match: ["/rounds"] },
  { label: "Course Planner", href: "/planner", match: ["/planner"] },
] as const

export default function NavBar() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6">

        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-[0.2em] text-[#22c55e] uppercase">
            Golf OS
          </span>
        </Link>

        {/* Nav items */}
        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.map(({ label, href, match }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : match.some((m) => pathname === m || pathname.startsWith(m + "/"))
            return (
              <Link
                key={href}
                href={href}
                className="relative flex flex-col items-center px-3 py-2 group"
              >
                <span className={[
                  "text-sm transition-colors",
                  active
                    ? "font-semibold text-white"
                    : "font-medium text-[#6b7280] group-hover:text-[#d1d5db]",
                ].join(" ")}>
                  {label}
                </span>
                {/* Active green dot indicator */}
                <span className={[
                  "absolute bottom-0.5 h-[3px] w-4 rounded-full transition-all",
                  active ? "bg-[#22c55e] opacity-100" : "opacity-0",
                ].join(" ")} />
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
