"use client"

// The Play planner's golfer settings, saved on this device: whose shots, handicap,
// carries, tendency, bags, recent courses, the setup prompt and the scoring
// baseline choice (moved verbatim from CourseMapClient.tsx). Same localStorage keys.

import { useEffect, useRef, useState } from "react"
import type { Tendency } from "@/lib/golfer/build"
import type { Club } from "@/lib/golfer/tables"
import { CALIBRATED_DEFAULT_BAG, DEFAULT_BAG, normalizeBag } from "@/lib/golfer/bag"
import type { MyProfile, ShotSource } from "@/lib/planner/types"
import { ONBOARDED_KEY, SETTINGS_KEY, applyBaselineToDevice, cleanCarries, type Baseline } from "@/lib/golfer/baseline"
import { COMPARE_AGAINST_EVENT, COMPARE_AGAINST_KEY, readCompareAgainst, type CompareAgainst } from "@/lib/course/baseline"
import { readSpread, SPREAD_EVENT, SPREAD_KEY } from "@/lib/course/spreadSetting"
import { ON_COURSE_SPREAD } from "@/lib/course/strategy"
import { RECENT_KEY, type CourseHit } from "@/lib/planner/storage"
import { BAG_SYNC_DEBOUNCE_MS, SETTINGS_STAMP_KEY, decideSync, stampMs, type SyncedSettings } from "@/lib/golfer/bagSync"
import { bannerVisible, readPrompt, recordView, writePrompt } from "@/lib/planner/setupPrompt"
import { saveGolferSettings } from "@/app/welcome/actions"

const SIDES = ["auto", "straight", "left", "right", "both"]
const STRENGTHS = ["slight", "moderate", "strong"]

/** A golfer with their own profile starts with the default bag plus every club they have data for. */
function defaultMineBag(myProfile: MyProfile | null): Club[] {
  return normalizeBag([...DEFAULT_BAG, ...(myProfile?.fits.map((f) => f.club) ?? [])])
}

/** Bump when the meaning of the saved "source" changes: older saves are then ignored once, so a golfer with a profile lands on My shots. */
const SOURCE_VERSION = 2

function readStamp(): number | null {
  try {
    const v = Number(localStorage.getItem(SETTINGS_STAMP_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function writeStamp(ms: number) {
  try {
    localStorage.setItem(SETTINGS_STAMP_KEY, String(ms))
  } catch {
    /* the device copy just has no time */
  }
}

export function usePlannerSettings({ calibrated, myProfile, baseline }: { calibrated: unknown[] | null; myProfile: MyProfile | null; baseline: Baseline | null }) {
  // --- golfer ---
  // Default: the golfer's own shots when they have a profile, else the old public data (?legacy=1), else a handicap estimate.
  const [source, setSource] = useState<ShotSource>(myProfile ? "calibrated" : calibrated ? "legacy" : "handicap")
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
    calibrated: defaultMineBag(myProfile),
    handicap: DEFAULT_BAG,
    legacy: CALIBRATED_DEFAULT_BAG,
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
    else if (!baseline && onboarded !== "1") {
      // Shown for the first few visits, then it collapses to a dot on the You tab (lib/planner/setupPrompt.ts).
      const { state } = readPrompt()
      const next = recordView(state)
      writePrompt(next)
      setShowSetupPrompt(bannerVisible(next))
    }
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v.sourceV === SOURCE_VERSION && (v.source === "handicap" || (v.source === "calibrated" && myProfile) || (v.source === "legacy" && calibrated))) setSource(v.source)
      if (typeof v.handicap === "number") setHandicap(Math.min(36, Math.max(0, v.handicap)))
      if (typeof v.driverCarry === "string") setDriverCarry(v.driverCarry.slice(0, 4))
      if (v.carries && typeof v.carries === "object") setExtraCarries(cleanCarries(v.carries))
      if (typeof v.sevenIronCarry === "string") setSevenIronCarry(v.sevenIronCarry.slice(0, 4))
      if (v.tendency && SIDES.includes(v.tendency.side) && STRENGTHS.includes(v.tendency.strength)) setTendency(v.tendency)
      if (v.bags && typeof v.bags === "object") {
        const mine = Array.isArray(v.bags.calibrated) ? normalizeBag(v.bags.calibrated) : []
        const hcp = Array.isArray(v.bags.handicap) ? normalizeBag(v.bags.handicap) : []
        const old = Array.isArray(v.bags.legacy) ? normalizeBag(v.bags.legacy) : []
        setBags({ calibrated: mine.length ? mine : defaultMineBag(myProfile), handicap: hcp.length ? hcp : DEFAULT_BAG, legacy: old.length ? old : CALIBRATED_DEFAULT_BAG })
      }
    }
    // A signed-in golfer's account is the source of truth: when it changed after this device did (or this
    // device never changed anything, like a new phone), its settings replace the device's. When the device
    // changed last, they are saved up to the account instead.
    if (baseline?.sync) {
      const remoteAt = stampMs(baseline.sync.updatedAt)
      const decision = decideSync(readStamp(), remoteAt)
      if (decision === "use-remote") applyRemote(baseline.sync.settings, remoteAt)
      else if (decision === "push-local") setPendingPush(true)
    }
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    if (Array.isArray(r)) setRecent(r.filter((c) => c && typeof c.id === "string" && typeof c.name === "string").slice(0, 5))
  }

  /** Lays the account's settings over this device's (fields the account lacks keep the device's value). */
  function applyRemote(r: Partial<SyncedSettings>, at: number | null) {
    if (r.source && (r.source === "handicap" || myProfile)) setSource(r.source)
    if (r.handicap != null) setHandicap(r.handicap)
    if (r.driverCarry != null) setDriverCarry(r.driverCarry)
    if (r.sevenIronCarry != null) setSevenIronCarry(r.sevenIronCarry)
    if (r.carries) setExtraCarries(r.carries)
    if (r.tendency) setTendency(r.tendency)
    if (r.bags) setBags((prev) => ({ ...prev, calibrated: r.bags!.calibrated, handicap: r.bags!.handicap }))
    writeStamp(at ?? Date.now())
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

  // ---- account sync (signed in with a setup row; guests keep the device copy only) ----
  // What the account stores: not the old public data's source or bag, which stay on this device.
  const synced: SyncedSettings = {
    source: source === "handicap" ? "handicap" : "calibrated",
    handicap,
    driverCarry,
    sevenIronCarry,
    carries: extraCarries,
    tendency,
    bags: { calibrated: bags.calibrated, handicap: bags.handicap },
  }
  const syncedSerial = JSON.stringify(synced)
  const lastSerial = useRef<string | null>(null)
  const [pendingPush, setPendingPush] = useState(false)
  const sentSerial = useRef<string | null>(null)

  // An edit (anything that changes the synced settings after the first settled render) stamps the device copy
  // and queues a save; the first render only records what is already there.
  useEffect(() => {
    if (!hydrated) return
    if (lastSerial.current == null) {
      lastSerial.current = syncedSerial
      return
    }
    if (lastSerial.current === syncedSerial) return
    lastSerial.current = syncedSerial
    writeStamp(Date.now())
    if (baseline?.sync) setPendingPush(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, syncedSerial])

  // Debounced save to the account. A failed save (offline) leaves it queued for the next edit or visit.
  useEffect(() => {
    if (!pendingPush || !hydrated || !baseline?.sync) return
    const t = setTimeout(async () => {
      sentSerial.current = syncedSerial
      try {
        const res = await saveGolferSettings(synced)
        if (res) {
          writeStamp(Date.parse(res.updatedAt)) // device and account now carry the same time
          if (sentSerial.current === lastSerial.current) setPendingPush(false)
        } else {
          setPendingPush(false) // no setup row to save into yet
        }
      } catch {
        /* offline or signed out: stays queued */
      }
    }, BAG_SYNC_DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPush, hydrated, syncedSerial])

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
