import type { SVGProps } from "react"

/** A ball on a tee, drawn like the other tab icons (24 grid, round-capped strokes in the current color). */
export function PracticeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="5" />
      <path d="M9 21h6" />
      <path d="M12 13v8" />
    </svg>
  )
}
