"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Flag, Map as MapIcon, User } from "lucide-react"
import { APP_NAME } from "@/lib/brand"
import { SETUP_PROMPT_EVENT, dotVisible, readPrompt } from "@/lib/planner/setupPrompt"

// Three main tabs. "match" lists extra path prefixes that keep a tab lit:
// Play is the course planner itself, You covers everything under /you (stats, practice, bag, settings, lab).
const NAV_ITEMS = [
  { label: "Play", href: "/", match: [], Icon: MapIcon },
  { label: "Rounds", href: "/rounds", match: ["/rounds"], Icon: Flag },
  { label: "You", href: "/you", match: ["/you"], Icon: User },
] as const

function isActive(pathname: string, href: string, match: readonly string[]) {
  if (href === "/" && pathname === "/") return true
  return match.some((m) => pathname === m || pathname.startsWith(m + "/"))
}

export default function NavBar() {
  const pathname = usePathname()
  // The setup banner on Play collapses to this dot on the You tab after it was dismissed or shown 3 times.
  const [setupDot, setSetupDot] = useState(false)
  useEffect(() => {
    const sync = () => {
      const { state, setupDone } = readPrompt()
      setSetupDot(dotVisible(state, setupDone))
    }
    sync()
    window.addEventListener(SETUP_PROMPT_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(SETUP_PROMPT_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [pathname])

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-fg/[0.08] bg-page/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 max-w-[1280px] items-center px-4 md:h-16 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-on-accent">
              <Flag size={15} strokeWidth={2.6} />
            </span>
            <span className="whitespace-nowrap text-sm font-bold tracking-tight text-fg">{APP_NAME}</span>
          </Link>
        </div>
      </header>

      {/* One tab list for every screen size: a bottom bar in thumb reach on phones,
          laid over the right side of the top bar on desktop. It sits outside the
          header because the header's backdrop-blur would trap a fixed child. */}
      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-fg/[0.08] bg-page/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:pointer-events-none md:bottom-auto md:top-[env(safe-area-inset-top)] md:border-0 md:bg-transparent md:pb-0 md:backdrop-blur-none"
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
                    active ? "text-accent md:font-semibold md:text-fg" : "text-muted md:hover:text-fg-2",
                  ].join(" ")}
                >
                  <span className="relative">
                    <Icon
                      strokeWidth={active ? 2.4 : 1.8}
                      className={`h-5 w-5 md:h-4 md:w-4 ${active ? "text-accent" : ""}`}
                    />
                    {label === "You" && setupDot && (
                      <span aria-label="Finish setup" className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-page" />
                    )}
                  </span>
                  {label}
                  <span
                    className={[
                      "absolute -bottom-[13px] left-3 right-3 hidden h-[2px] rounded-full bg-accent md:block",
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
