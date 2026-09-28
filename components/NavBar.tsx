"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Flag, Map as MapIcon, User } from "lucide-react"

// Three main tabs. "match" lists extra path prefixes that keep a tab lit:
// Play covers the Course Planner, You covers the bag tools under /you/bag.
const NAV_ITEMS = [
  { label: "Play", href: "/", match: ["/planner"], Icon: MapIcon },
  { label: "Rounds", href: "/rounds", match: ["/rounds"], Icon: Flag },
  { label: "You", href: "/you", match: ["/you"], Icon: User },
] as const

function isActive(pathname: string, href: string, match: readonly string[]) {
  if (href === "/" && pathname === "/") return true
  return match.some((m) => pathname === m || pathname.startsWith(m + "/"))
}

export default function NavBar() {
  const pathname = usePathname()

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 max-w-[1280px] items-center px-4 md:h-16 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#22c55e] text-black">
              <Flag size={15} strokeWidth={2.6} />
            </span>
            <span className="whitespace-nowrap text-sm font-bold tracking-tight text-white">
              Golf <span className="text-[#22c55e]">OS</span>
            </span>
          </Link>
        </div>
      </header>

      {/* One tab list for every screen size: a bottom bar in thumb reach on phones,
          laid over the right side of the top bar on desktop. It sits outside the
          header because the header's backdrop-blur would trap a fixed child. */}
      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:pointer-events-none md:bottom-auto md:top-[env(safe-area-inset-top)] md:border-0 md:bg-transparent md:pb-0 md:backdrop-blur-none"
      >
        <ul className="grid grid-cols-3 md:mx-auto md:flex md:h-16 md:max-w-[1280px] md:items-center md:justify-end md:gap-0.5 md:px-6">
          {NAV_ITEMS.map(({ label, href, match, Icon }) => {
            const active = isActive(pathname, href, match)
            return (
              <li key={href} className="md:pointer-events-auto">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "group relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                    "md:h-auto md:flex-row md:gap-2 md:px-3.5 md:py-2 md:text-sm",
                    active ? "text-[#22c55e] md:font-semibold md:text-white" : "text-[#6b7280] md:hover:text-[#d1d5db]",
                  ].join(" ")}
                >
                  <Icon
                    strokeWidth={active ? 2.4 : 1.8}
                    className={`h-5 w-5 md:h-4 md:w-4 ${active ? "text-[#22c55e]" : ""}`}
                  />
                  {label}
                  <span
                    className={[
                      "absolute -bottom-[13px] left-3 right-3 hidden h-[2px] rounded-full bg-[#22c55e] md:block",
                      active ? "opacity-100" : "opacity-0",
                    ].join(" ")}
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
