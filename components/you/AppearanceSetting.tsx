"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { applyThemePreference, readThemePreference, type ThemePreference } from "@/lib/theme/preference"

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
]

export function AppearanceSetting() {
  // The saved choice only exists in the browser, so nothing is highlighted
  // until mount -- rendering a guess on the server would flash the wrong one.
  const [pref, setPref] = useState<ThemePreference | null>(null)
  useEffect(() => setPref(readThemePreference()), [])

  function choose(next: ThemePreference) {
    applyThemePreference(next)
    setPref(next)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
      <div>
        <p className="label-xs">Appearance</p>
        <p className="mt-1 text-xs text-muted">System matches your device&rsquo;s light or dark mode</p>
      </div>
      <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-lg border border-fg/[0.06] bg-surface-3 p-1">
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = pref === value
          return (
            <button
              key={value}
              role="radio"
              aria-checked={active}
              onClick={() => choose(value)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
