"use client"

// Which full clubs show their partial swings: collapsed until tapped, open while one of them is the chosen club.

import { useMemo, useState } from "react"
import { parsePartial } from "@/lib/golfer/partials"
import { groupPartials } from "@/lib/planner/partialGroups"

export function usePartialGroups<T extends { club: string }>(ranking: readonly T[], chosen: { club: string } | null) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const groups = useMemo(() => groupPartials(ranking), [ranking])
  const chosenParent = chosen ? parsePartial(chosen.club)?.club : undefined
  const isOpen = (club: string) => open.has(club) || club === chosenParent
  const toggle = (club: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(club)) next.add(club)
      return next
    })
  return { groups, isOpen, toggle }
}
