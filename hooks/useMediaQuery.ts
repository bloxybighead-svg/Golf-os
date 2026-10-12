"use client"

// True while the query matches. False on the server and first paint, so markup that
// differs by size is only a refinement after mount, never a hydration mismatch.

import { useEffect, useState } from "react"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const q = window.matchMedia(query)
    const sync = () => setMatches(q.matches)
    sync()
    q.addEventListener("change", sync)
    return () => q.removeEventListener("change", sync)
  }, [query])
  return matches
}
