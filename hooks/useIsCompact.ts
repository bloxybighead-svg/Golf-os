"use client"

// True on phones, upright or sideways: where round mode takes over the screen.

import { ROUND_COMPACT_QUERY } from "@/lib/rounds/roundMode"
import { useMediaQuery } from "./useMediaQuery"

export function useIsCompact(): boolean {
  return useMediaQuery(ROUND_COMPACT_QUERY)
}
