"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, ClipboardList, Crosshair, Flag, GitCompare, Map as MapIcon, SlidersHorizontal, TrendingUp, type LucideIcon } from "lucide-react"

// Icons are referenced by name because a server component can't pass a component function to a client one.
const ICONS: Record<string, LucideIcon> = {
  map: MapIcon,
  activity: Activity,
  compare: GitCompare,
  sliders: SlidersHorizontal,
  flag: Flag,
  log: ClipboardList,
  drills: Crosshair,
  trends: TrendingUp,
}

export interface SubNavItem {
  label: string
  href: string
  icon?: keyof typeof ICONS
}

// Second-level tabs under a main nav item. The first item matches its exact
// path only when it is the section root (e.g. /planner), so it doesn't stay
// highlighted while a sibling like /planner/compare is open.
export default function SubNav({ items, ariaLabel }: { items: SubNavItem[]; ariaLabel: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label={ariaLabel} className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto whitespace-nowrap border-b border-white/[0.06] px-4 pb-3 md:mx-0 md:mb-6 md:px-0">
      {items.map(({ label, href, icon }) => {
        const Icon = icon ? ICONS[icon] : null
        const isRoot = items.some((o) => o !== items.find((i) => i.href === href) && o.href.startsWith(href + "/"))
        const active = isRoot ? pathname === href : pathname === href || pathname.startsWith(href + "/")
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors md:py-1.5 ${
              active ? "bg-[#22c55e]/15 text-[#22c55e]" : "text-[#9ca3af] hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {Icon && <Icon size={14} />}
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
