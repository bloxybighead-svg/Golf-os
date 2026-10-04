"use client"

// My bag summary: the clubs in the bag with their carries, how much of the
// golfer's own shot data stands behind each (Solid / OK / Thin, from 13c), and
// the home course. Editing happens on /welcome in edit mode and returns here.

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { CourseRef } from "@/lib/golfer/baseline"
import { readDeviceBag, type DeviceBag } from "@/lib/you/deviceBag"
import { buildBagRows, type FittedClub } from "@/lib/you/hub"
import { BadgePill } from "@/components/shots/ui"

const EDIT_HREF = "/welcome?edit=1&return=%2Fyou%2Fbag"

function LinkRow({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[56px] items-center justify-between rounded-xl border border-fg/[0.06] bg-surface px-5 py-3 transition-colors hover:bg-fg/[0.03]"
    >
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-xs text-muted">{blurb}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

export function MyBag({
  fitted,
  defaultSource,
  serverHomeCourse,
}: {
  fitted: FittedClub[] | null
  defaultSource: "calibrated" | "handicap"
  serverHomeCourse: CourseRef | null
}) {
  const [device, setDevice] = useState<DeviceBag | null>(null)
  useEffect(() => setDevice(readDeviceBag(defaultSource, fitted?.map((f) => f.club) ?? [])), [defaultSource, fitted])

  if (!device) return <p className="py-6 text-sm text-muted">Loading…</p>

  // Fitted shots are the golfer's own, so they only back a bag that plays from them.
  const rows = buildBagRows({
    bag: device.bag,
    carries: device.carries,
    fitted: device.source === "calibrated" ? fitted : null,
  })
  const home = serverHomeCourse ?? device.course
  const anyBadge = rows.some((r) => r.badge)

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-fg/[0.06] bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <p className="label-xs">Clubs</p>
          <Link href={EDIT_HREF} className="flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline md:min-h-0">
            Edit
          </Link>
        </div>
        <ul className="mt-1 divide-y divide-fg/[0.04]">
          {rows.map((r) => (
            <li key={r.club} className="flex min-h-[44px] items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 text-sm font-medium text-fg">{r.club}</span>
              {r.badge && <BadgePill badge={r.badge} />}
              <span className="w-16 shrink-0 text-right text-sm text-fg-3 tabular-nums">
                {r.carryYds != null ? `${r.carryYds} yd` : "typical"}
              </span>
            </li>
          ))}
        </ul>
        {anyBadge ? (
          <p className="px-5 pb-4 pt-2 text-xs text-muted">Solid, OK and Thin show how many of your own shots back each club.</p>
        ) : (
          <p className="px-5 pb-4 pt-2 text-xs text-muted">
            Clubs marked typical use average distances for your handicap.{" "}
            <Link href="/you/bag/shots" className="font-semibold text-accent hover:underline">
              Add your shots
            </Link>
          </p>
        )}
      </section>

      <section className="rounded-xl border border-fg/[0.06] bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="label-xs">Home course</p>
            <p className="mt-1 truncate text-sm font-medium text-fg">{home ? home.name : "Not set"}</p>
          </div>
          <Link href={EDIT_HREF} className="flex min-h-[44px] shrink-0 items-center text-sm font-semibold text-accent hover:underline md:min-h-0">
            {home ? "Change" : "Set"}
          </Link>
        </div>
      </section>

      <LinkRow href="/you/bag/shots" title="My shot data" blurb="Upload your real shots so the planner learns your game" />
      <LinkRow href="/you/bag/misses" title="Your misses" blurb="Where each club's shots land" />
    </div>
  )
}
