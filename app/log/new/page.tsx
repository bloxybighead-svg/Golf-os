"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { SessionBlock, Drill, Location, SessionType, ClubWorkEntry } from "@/lib/supabase/types"
import { BlockForm } from "@/components/log/BlockForm"
import { BlockCard } from "@/components/log/BlockCard"
import { RatingDots } from "@/components/log/RatingDots"
import { ClubWork } from "@/components/log/ClubWork"

const LOCATIONS: Location[] = [
  "Range (Colts Neck grass)",
  "Net (Home)",
  "Short Game Area",
  "Putting Green",
  "On-Course Practice",
]

const SESSION_TYPES: SessionType[] = [
  "Full Swing Focus",
  "Wedge Focus",
  "Short Game Focus",
  "Putting Focus",
  "Mixed",
]

function todayISO() {
  return new Date().toISOString().split("T")[0]
}

function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

type Step = "header" | "building" | "finish"

export default function NewSessionPage() {
  const router = useRouter()
  const [drills, setDrills] = useState<Drill[]>([])
  const [step, setStep] = useState<Step>("header")
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Quick Log mode — compact alternate entry; full form stays the default
  const [quickMode, setQuickMode] = useState(false)
  const [quickDuration, setQuickDuration] = useState("")

  // Header
  const [date, setDate] = useState(todayISO())
  const [startTime, setStartTime] = useState(nowTime())
  const [locations, setLocations] = useState<Location[]>([])
  const [sessionType, setSessionType] = useState<SessionType>("Mixed")
  const [primaryGoal, setPrimaryGoal] = useState("")

  // Blocks
  const [blocks, setBlocks] = useState<SessionBlock[]>([])

  // Club work
  const [clubWork, setClubWork] = useState<ClubWorkEntry[]>([])

  // Finish
  const [overallFeel, setOverallFeel] = useState<number | null>(null)
  const [energyLevel, setEnergyLevel] = useState<number | null>(null)
  const [finalNotes, setFinalNotes] = useState("")

  useEffect(() => {
    createClient()
      .from("drills")
      .select("*")
      .order("name")
      .then(({ data }) => { if (data) setDrills(data as Drill[]) })
  }, [])

  const toggleLocation = (loc: Location) =>
    setLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    )

  const addBlock = (block: SessionBlock) => {
    setBlocks((prev) => [...prev, block])
    setShowBlockForm(false)
  }

  const totalDuration = blocks.reduce((sum, b) => sum + (b.duration_minutes ?? 0), 0)
  const quickDurationMin = quickDuration !== "" ? parseInt(quickDuration) || 0 : 0

  const saveQuickSession = async () => {
    setSaving(true)
    setSaveError(null)
    const { error } = await createClient().from("practice_sessions").insert({
      date,
      start_time: null,
      duration_minutes: quickDurationMin || null,
      location: [],
      session_type: "Mixed",
      primary_goal: null,
      overall_feel: null,
      energy_level: null,
      notes: finalNotes || null,
      club_work: [],
    })
    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }
    router.push("/log")
  }

  const saveSession = async () => {
    setSaving(true)
    setSaveError(null)
    const supabase = createClient()

    const { data: session, error: sessionError } = await supabase
      .from("practice_sessions")
      .insert({
        date,
        start_time: startTime || null,
        duration_minutes: totalDuration || quickDurationMin || null,
        location: locations,
        session_type: sessionType,
        primary_goal: primaryGoal || null,
        overall_feel: overallFeel,
        energy_level: energyLevel,
        notes: finalNotes || null,
        club_work: clubWork,
      })
      .select()
      .single()

    if (sessionError || !session) {
      setSaveError(sessionError?.message ?? "Failed to save session. Check your Supabase connection.")
      setSaving(false)
      return
    }

    if (blocks.length > 0) {
      const { error: blocksError } = await supabase.from("session_blocks").insert(
        blocks.map((b, i) => ({ session_id: session.id, block_order: i, ...b }))
      )
      if (blocksError) {
        setSaveError(blocksError.message)
        setSaving(false)
        return
      }
    }

    router.push("/log")
  }

  // Block form overlay takes over full screen
  if (showBlockForm) {
    return (
      <BlockForm
        drills={drills}
        onSave={addBlock}
        onCancel={() => setShowBlockForm(false)}
      />
    )
  }

  // ── Quick Log mode ─────────────────────────────────────
  if (quickMode) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Quick Log</h2>
          <button
            onClick={() => router.push("/log")}
            className="text-sm text-[#6b7280] hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white focus:border-[#4ade80] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
              Duration (min)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={quickDuration}
              onChange={(e) => setQuickDuration(e.target.value)}
              placeholder="e.g. 45"
              className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
            Note <span className="normal-case tracking-normal text-[#4b5563]">optional</span>
          </label>
          <textarea
            value={finalNotes}
            onChange={(e) => setFinalNotes(e.target.value)}
            placeholder="What did you work on?"
            rows={3}
            className="w-full resize-none rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
          />
        </div>

        {saveError && (
          <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400">
            {saveError}
          </p>
        )}

        <button
          onClick={saveQuickSession}
          disabled={saving || !date}
          className="w-full rounded-md bg-[#4ade80] py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Quick Session"}
        </button>

        <button
          onClick={() => setQuickMode(false)}
          className="w-full rounded-md border border-dashed border-[#2a2a2a] py-3 text-sm text-[#6b7280] transition-colors hover:border-white hover:text-white"
        >
          Add full details →
        </button>
        <p className="text-center text-xs text-[#4b5563]">
          Date, duration and note carry over into the full form.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">

      {/* ── STEP 1: Header ─────────────────────────────────── */}
      {step === "header" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">New Session</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQuickMode(true)}
                className="rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-[#6b7280] transition-colors hover:border-[#4ade80] hover:text-[#4ade80]"
              >
                ⚡ Quick Log
              </button>
              <button
                onClick={() => router.push("/log")}
                className="text-sm text-[#6b7280] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white focus:border-[#4ade80] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white focus:border-[#4ade80] focus:outline-none"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">Location</p>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => toggleLocation(loc)}
                  className={[
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    locations.includes(loc)
                      ? "border-[#4ade80] bg-[#4ade80] font-medium text-black"
                      : "border-[#2a2a2a] text-[#6b7280] hover:border-white hover:text-white",
                  ].join(" ")}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {/* Session type */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">Session Type</p>
            <div className="flex flex-wrap gap-2">
              {SESSION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSessionType(t)}
                  className={[
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    sessionType === t
                      ? "border-[#4ade80] bg-[#4ade80] font-medium text-black"
                      : "border-[#2a2a2a] text-[#6b7280] hover:border-white hover:text-white",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Primary goal */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
              Primary Goal
            </label>
            <input
              type="text"
              value={primaryGoal}
              onChange={(e) => setPrimaryGoal(e.target.value)}
              placeholder="What are you working on today?"
              className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
            />
          </div>

          <button
            onClick={() => setStep("building")}
            disabled={locations.length === 0}
            className="w-full rounded-md bg-[#4ade80] py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Start Session →
          </button>
        </div>
      )}

      {/* ── STEP 2: Building blocks ─────────────────────────── */}
      {step === "building" && (
        <div className="space-y-4">
          {/* Session summary bar */}
          <div className="rounded-md border border-[#2a2a2a] bg-[#161616] px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{sessionType}</p>
                <p className="text-xs text-[#6b7280]">
                  {locations.join(" + ")} · {date}
                </p>
              </div>
              <button
                onClick={() => setStep("header")}
                className="shrink-0 text-xs text-[#6b7280] hover:text-white transition-colors"
              >
                edit
              </button>
            </div>
            {primaryGoal && (
              <p className="mt-1.5 text-xs text-[#4ade80]">"{primaryGoal}"</p>
            )}
          </div>

          {/* Block list */}
          {blocks.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#6b7280]">
              No blocks yet. Tap below to add your first one.
            </p>
          ) : (
            <div className="space-y-2">
              {blocks.map((block, i) => (
                <BlockCard
                  key={i}
                  block={block}
                  index={i}
                  onRemove={() => setBlocks((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
              <p className="pt-1 text-xs text-[#6b7280]">
                {blocks.length} block{blocks.length !== 1 ? "s" : ""} · {totalDuration} min total
              </p>
            </div>
          )}

          <button
            onClick={() => setShowBlockForm(true)}
            className="w-full rounded-md border border-dashed border-[#2a2a2a] py-3 text-sm text-[#6b7280] transition-colors hover:border-white hover:text-white"
          >
            + Add Block
          </button>

          {/* Club Work (optional) */}
          <div className="rounded-md border border-[#2a2a2a] bg-[#161616] px-4 py-3.5">
            <div className="mb-3">
              <p className="text-sm font-medium text-white">Club Work</p>
              <p className="text-xs text-[#6b7280]">Optional — log shot numbers per club + feel (one entry per feel)</p>
            </div>
            <ClubWork entries={clubWork} onChange={setClubWork} />
          </div>

          <button
            onClick={() => setStep("finish")}
            className="w-full rounded-md bg-[#4ade80] py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Finish Session →
          </button>
        </div>
      )}

      {/* ── STEP 3: Wrap up ─────────────────────────────────── */}
      {step === "finish" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Wrap Up</h2>
            <button
              onClick={() => setStep("building")}
              className="text-sm text-[#6b7280] hover:text-white transition-colors"
            >
              ← Back
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">
              Overall Feel
            </p>
            <RatingDots value={overallFeel} onChange={setOverallFeel} />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">
              Energy Level
            </p>
            <RatingDots value={energyLevel} onChange={setEnergyLevel} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
              Final Notes
            </label>
            <textarea
              value={finalNotes}
              onChange={(e) => setFinalNotes(e.target.value)}
              placeholder="Anything to carry forward into the next session…"
              rows={4}
              className="w-full resize-none rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
            />
          </div>

          {/* Session summary */}
          <div className="rounded-md border border-[#2a2a2a] bg-[#161616] px-4 py-3 space-y-1 text-xs text-[#6b7280]">
            <p>{date} · {sessionType}</p>
            <p>{blocks.length} block{blocks.length !== 1 ? "s" : ""} · {totalDuration} min</p>
            {primaryGoal && <p className="text-[#4ade80]">"{primaryGoal}"</p>}
          </div>

          {saveError && (
            <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400">
              {saveError}
            </p>
          )}

          <button
            onClick={saveSession}
            disabled={saving}
            className="w-full rounded-md bg-[#4ade80] py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Session"}
          </button>
        </div>
      )}
    </div>
  )
}
