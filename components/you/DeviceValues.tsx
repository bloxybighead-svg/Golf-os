"use client"

// Hub row values that live on this device (the bag and the theme), so they can
// only be read in the browser. They render empty until mount, like the settings.

import { useEffect, useState } from "react"
import { readThemePreference, type ThemePreference } from "@/lib/theme/preference"
import { readDeviceBag } from "@/lib/you/deviceBag"
import type { Club } from "@/lib/golfer/tables"

const THEME_LABEL: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" }

export function BagCount({ defaultSource, fittedClubs }: { defaultSource: "calibrated" | "handicap"; fittedClubs: Club[] }) {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => setN(readDeviceBag(defaultSource, fittedClubs).bag.length), [defaultSource, fittedClubs])
  return <>{n == null ? "" : `${n} clubs`}</>
}

export function ThemeLabel() {
  const [p, setP] = useState<ThemePreference | null>(null)
  useEffect(() => setP(readThemePreference()), [])
  return <>{p ? THEME_LABEL[p] : ""}</>
}
