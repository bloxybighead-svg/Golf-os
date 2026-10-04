"use client"

// The first-visit intro on Play: three short cards over the map. Skip and the
// last card's button both count as seen (the caller marks it). Rules live in
// lib/planner/intro.ts.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { INTRO_CARDS } from "@/lib/planner/intro"

export function IntroCards({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const nextRef = useRef<HTMLButtonElement>(null)
  const last = i === INTRO_CARDS.length - 1
  const card = INTRO_CARDS[i]

  useEffect(() => {
    nextRef.current?.focus()
  }, [i])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-page/80 px-4 pb-24 backdrop-blur-sm md:items-center md:pb-4">
      <div role="dialog" aria-modal="true" aria-labelledby="intro-title" className="w-full max-w-sm rounded-xl border border-fg/[0.12] bg-surface p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted tabular-nums">
            {i + 1} of {INTRO_CARDS.length}
          </p>
          <button onClick={onClose} className="-mr-2 flex min-h-[44px] items-center px-2 text-sm text-muted hover:text-fg">
            Skip
          </button>
        </div>
        <h2 id="intro-title" className="mt-1 text-xl font-semibold tracking-tight text-fg">
          {card.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">{card.body}</p>
        {last && (
          <Link href="/welcome" onClick={onClose} className="mt-3 flex min-h-[44px] w-fit items-center text-sm font-semibold text-accent hover:underline">
            Set up my clubs
          </Link>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          {i > 0 ? (
            <button onClick={() => setI(i - 1)} className="min-h-[44px] px-1 text-sm font-semibold text-fg-2 hover:text-fg">
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            ref={nextRef}
            onClick={() => (last ? onClose() : setI(i + 1))}
            className="h-11 rounded-lg bg-accent px-6 text-sm font-semibold text-on-accent transition-all hover:brightness-110"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  )
}
