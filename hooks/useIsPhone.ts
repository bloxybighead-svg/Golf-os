"use client"

// True below Tailwind's md breakpoint (phones).

import { useMediaQuery } from "./useMediaQuery"

export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 767px)")
}
