"use client"

// True below Tailwind's md breakpoint (phones). False on the server and first paint, so markup that
// differs by size is only a refinement after mount, never a hydration mismatch.

import { useEffect, useState } from "react"

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)")
    const sync = () => setPhone(q.matches)
    sync()
    q.addEventListener("change", sync)
    return () => q.removeEventListener("change", sync)
  }, [])
  return phone
}
