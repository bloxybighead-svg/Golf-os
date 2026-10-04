"use client"

// The Play planner's golfer settings, saved on this device: whose shots, handicap,
// carries, tendency, bags, recent courses, the setup prompt and the scoring
// baseline choice (moved verbatim from CourseMapClient.tsx). Same localStorage keys.

import { useEffect, useState } from "react"
import type { Tendency } from "@/lib/golfer/build"
import type { Club } from "@/lib/golfer/tables"
import { CALIBRATED_DEFAULT_BAG, DEFAULT_BAG, normalizeBag } from "@/lib/golfer/bag"
import type { MyProfile, ShotSource } from "@/lib/planner/types"
import { ONBOARDED_KEY, SETTINGS_KEY, applyBaselineToDevice, cleanCarries, type Baseline } from "@/lib/golfer/baseline"
import { COMPARE_AGAINST_EVENT, COMPARE_AGAINST_KEY, readCompareAgainst, type CompareAgainst } from "@/lib/course/baseline"
import { readSpread, SPREAD_EVENT, SPREAD_KEY } from "@/lib/course/spreadSetting"
import { ON_COURSE_SPREAD } from "@/lib/course/strategy"
import { RECENT_KEY, type CourseHit } from "@/lib/planner/storage"

const SIDES = ["auto", "straight", "left", "right", "both"]
const STRENGTHS = ["slight", "moderate", "strong"]

/** A golfer with their own profile starts with the default bag plus every club they have data for. */
function defaultMineBag(myProfile: MyProfile | null): Club[] {
  return normalizeBag([...DEFAULT_BAG, ...(myProfile?.fits.map((f) => f.club) ?? [])])
}

/** Bump when the meaning of the saved "source" changes: older saves are then ignored once, so a golfer with a profile lands on My shots. */
const SOURCE_VERSION = 2

export function usePlannerSettings({ calibrated, myProfile, baseline }: { calibrated: unknown[] | null; myProfile: MyProfile | null; baseline: Baseline | null }) {
  // --- golfer ---
  // Default: the golfer's own shots when they have a profile, else the old public data (?legacy=1), else a handicap estimate.
  const [source, setSource] = useState<ShotSource>(myProfile ? "mine" : calibrated ? "calibrated" : "handicap")
  const [handicap, setHandicap] = useState(10)
  const [driverCarry, setDriverCarry] = useState("") // yards; blank = handicap average
  const [sevenIronCarry, setSevenIronCarry] = useState("")
  const [tendency, setTendency] = useState<Tendency>({ side: "auto", strength: "moderate" })
  // Carries for clubs beyond driver and 7-iron, from setup (/welcome).
  const [extraCarries, setExtraCarries] = useState<Partial<Record<Club, number>>>({})
  // First visit on this device with no setup yet: offer it, once.
  const [showSetupPrompt, setShowSetupPrompt] = useState(false)
  // Which clubs are in the bag, per shot source (the calibrated golfer and a
  // handicap-based one carry different bags). Remembered on this device.
  const [bags, setBags] = useState<Record<ShotSource, Club[]>>({
    mine: defaultMineBag(myProfile),
    calibrated: CALIBRATED_DEFAULT_BAG,
    handicap: DEFAULT_BAG,
  })
  const bag = bags[source]

  // Score against the golfer's handicap (default) or the PGA TOUR -- chosen on You, saved per device.
  const [compareAgainst, setCompareAgainst] = useState<CompareAgainst>("handicap")
  useEffect(() => {
    const sync = () => setCompareAgainst(readCompareAgainst())
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPARE_AGAINST_KEY) sync()
    }
    sync()
    window.addEventListener(COMPARE_AGAINST_EVENT, sync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(COMPARE_AGAINST_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])
  // How much wider Par mode makes the golfer's misses (You -> Planner), saved per device.
  const [onCourseSpread, setOnCourseSpread] = useState(ON_COURSE_SPREAD)
  useEffect(() => {
    const sync = () => setOnCourseSpread(readSpread())
    const onStorage = (e: StorageEvent) => {
      if (e.key === SPREAD_KEY) sync()
    }
    sync()
    window.addEventListener(SPREAD_EVENT, sync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(SPREAD_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])
  const [recent, setRecent] = useState<CourseHit[]>([])
  const [hydrated, setHydrated] = useState(false)

  /**
   * The settings half of the planner's start-up (the caller's mount effect runs
   * it, then resumes the course, inside one try -- as before the split). Throws
   * on unreadable storage, like the original code did.
   */
  function loadFromDevice() {
    // A signed-in golfer's setup numbers become this device's settings the
    // first time Play opens here (their home course, their clubs).
    const onboarded = localStorage.getItem(ONBOARDED_KEY)
    if (baseline && onboarded !== "1") applyBaselineToDevice(baseline)
    else if (!baseline && onboarded == null) setShowSetupPrompt(true)
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v.sourceV === SOURCE_VERSION && (v.source === "handicap" || (v.source === "mine" && myProfile) || (v.source === "calibrated" && calibrated))) setSource(v.source)
      if (typeof v.handicap === "number") setHandicap(Math.min(36, Math.max(0, v.handicap)))
      if (typeof v.driverCarry === "string") setDriverCarry(v.driverCarry.slice(0, 4))
      if (v.carries && typeof v.carries === "object") setExtraCarries(cleanCarries(v.carries))
      if (typeof v.sevenIronCarry === "string") setSevenIronCarry(v.sevenIronCarry.slice(0, 4))
      if (v.tendency && SIDES.includes(v.tendency.side) && STRENGTHS.includes(v.tendency.strength)) setTendency(v.tendency)
      if (v.bags && typeof v.bags === "object") {
        const mine = Array.isArray(v.bags.mine) ? normalizeBag(v.bags.mine) : []
        const cal = Array.isArray(v.bags.calibrated) ? normalizeBag(v.bags.calibrated) : []
        const hcp = Array.isArray(v.bags.handicap) ? normalizeBag(v.bags.handicap) : []
        setBags({ mine: mine.length ? mine : defaultMineBag(myProfile), calibrated: cal.length ? cal : CALIBRATED_DEFAULT_BAG, handicap: hcp.length ? hcp : DEFAULT_BAG })
      }
    }
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    if (Array.isArray(r)) setRecent(r.filter((c) => c && typeof c.id === "string" && typeof c.name === "string").slice(0, 5))
  }

  function markHydrated() {
    setHydrated(true)
  }

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ source, sourceV: SOURCE_VERSION, handicap, driverCarry, sevenIronCarry, carries: extraCarries, tendency, bags })
      )
    } catch {
      /* storage full or blocked: settings just won't be remembered */
    }
  }, [hydrated, source, handicap, driverCarry, sevenIronCarry, extraCarries, tendency, bags])

  /** Adds or removes a club from the current bag. Returns false when nothing changed (a bag keeps at least one club). */
  function toggleClub(c: Club): boolean {
    const current = bags[source]
    const has = current.includes(c)
    if (has && current.length === 1) return false // a bag needs at least one club
    const next = normalizeBag(has ? current.filter((x) => x !== c) : [...current, c])
    setBags((prev) => ({ ...prev, [source]: next }))
    return true
  }

  function remember(c: CourseHit) {
    setRecent((prev) => {
      const next = [c, ...prev.filter((x) => x.id !== c.id)].slice(0, 5)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return {
    source,
    setSource,
    handicap,
    setHandicap,
    driverCarry,
    setDriverCarry,
    sevenIronCarry,
    setSevenIronCarry,
    tendency,
    setTendency,
    extraCarries,
    showSetupPrompt,
    setShowSetupPrompt,
    bags,
    bag,
    compareAgainst,
    onCourseSpread,
    recent,
    hydrated,
    loadFromDevice,
    markHydrated,
    toggleClub,
    remember,
  }
}

export type PlannerSettings = ReturnType<typeof usePlannerSettings>
