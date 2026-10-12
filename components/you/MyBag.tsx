"use client"

// My bag: each club with the carry and total the planner decides from, where
// that number comes from, and any gapping problem between neighbours. Tap a
// row to type your own carry; the home course is edited on /welcome.

import { Fragment, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { CourseRef } from "@/lib/golfer/baseline"
import { carryRange, typedCarries, validTypedCarry } from "@/lib/golfer/bagShots"
import { PARTIAL_CARRY_RATIO, PARTIAL_WEDGES, SWING_LENGTHS, cleanWedgeCarries, partialName, type PartialName } from "@/lib/golfer/partials"
import { THIN_BELOW, type ClubFit } from "@/lib/golfer/shotProfile"
import type { Club } from "@/lib/golfer/tables"
import { buildBagNumbers, gapNotes, sourceLabel, type BagNumber } from "@/lib/you/bagNumbers"
import { readDeviceBag, writeClubCarry, writeWedgeCarries, type DeviceBag } from "@/lib/you/deviceBag"

/** Play's starting handicap, used until the golfer sets one. */
const PLAY_START_HANDICAP = 10
const EDIT_HREF = "/welcome?edit=1&return=%2Fyou%2Fbag"

function LinkRow({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[56px] items-center justify-between rounded-xl border border-fg/[0.06] bg-surface px-5 py-3 transition-colors hover:bg-fg/[0.03]"
    >
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-xs text-muted">{blurb}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

/** Carries for the partial wedge swings: a typed number replaces the one derived from the full club. */
function WedgeNumbers({ rows, initial }: { rows: BagNumber[]; initial: Partial<Record<PartialName, number>> }) {
  const [typed, setTyped] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])))
  const wedges = PARTIAL_WEDGES.filter((w) => rows.some((r) => r.club === w))
  if (wedges.length === 0) return null

  const save = () => writeWedgeCarries(cleanWedgeCarries(typed))
  return (
    <section className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <p className="label-xs">Wedge numbers</p>
      <div className="mt-2 grid grid-cols-[2.5rem_repeat(3,minmax(0,1fr))] items-center gap-x-2 gap-y-2 text-sm">
        <span />
        {["Full", ...SWING_LENGTHS].map((h) => (
          <span key={h} className="text-right text-xs text-muted">{h}</span>
        ))}
        {wedges.map((w) => {
          const full = rows.find((r) => r.club === w)?.carryYds ?? null
          return (
            <Fragment key={w}>
              <span className="font-medium text-fg">{w}</span>
              <span className="text-right text-fg-3 tabular-nums">{full ?? "–"}</span>
              {SWING_LENGTHS.map((l) => {
                const name = partialName(w, l)
                return (
                  <input
                    key={name}
                    type="text"
                    inputMode="numeric"
                    aria-label={`${name} carry in yards`}
                    placeholder={full != null ? String(Math.round(full * PARTIAL_CARRY_RATIO[l])) : "–"}
                    value={typed[name] ?? ""}
                    onChange={(e) => setTyped((t) => ({ ...t, [name]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                    onBlur={save}
                    className="h-11 w-full min-w-0 rounded-lg border border-fg/[0.12] bg-transparent px-2 text-right text-base text-fg tabular-nums placeholder:text-faint"
                  />
                )
              })}
            </Fragment>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Greyed numbers are estimates ({SWING_LENGTHS.map((l) => `${l} = ${Math.round(PARTIAL_CARRY_RATIO[l] * 100)}%`).join(", ")} of full). Type your own to replace them.</p>
    </section>
  )
}

/** Tap to type a carry for this club; "Reset" returns it to the number derived from your shots or handicap. */
function ClubEditor({ row, onSave, onCancel }: { row: BagNumber; onSave: (carry: number | null) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(row.source === "typed" ? String(row.carryYds) : "")
  const [invalid, setInvalid] = useState(false)
  const [lo, hi] = carryRange(row.club)
  return (
    <form
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-3"
      onSubmit={(e) => {
        e.preventDefault()
        const v = validTypedCarry(row.club, draft)
        if (v == null) setInvalid(true)
        else onSave(v)
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        aria-label={`${row.club} carry in yards`}
        placeholder={String(row.carryYds)}
        value={draft}
        onChange={(e) => {
          setInvalid(false)
          setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))
        }}
        className="h-11 w-24 rounded-lg border border-fg/[0.12] bg-transparent px-3 text-right text-base text-fg tabular-nums placeholder:text-faint"
      />
      <span className="text-sm text-muted">yd carry</span>
      <button type="submit" className="flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline">
        Save
      </button>
      <button type="button" onClick={onCancel} className="flex min-h-[44px] items-center text-sm text-muted hover:underline">
        Cancel
      </button>
      {row.source === "typed" && (
        <button type="button" onClick={() => onSave(null)} className="flex min-h-[44px] items-center text-sm text-muted hover:underline">
          Reset
        </button>
      )}
      {row.source === "shots" && (row.nShots ?? 0) >= THIN_BELOW && (
        <p className="basis-full text-xs text-muted">Your {row.nShots} shots outweigh a typed number for this club.</p>
      )}
      {invalid && <p className="basis-full text-xs text-danger">Enter {lo} to {hi} yards.</p>}
    </form>
  )
}

export function MyBag({
  fits,
  accountHandicap,
  serverHomeCourse,
}: {
  fits: ClubFit[] | null
  /** The golfer's tracked or setup handicap, which thin clubs blend toward. */
  accountHandicap: number | null
  serverHomeCourse: CourseRef | null
}) {
  const [device, setDevice] = useState<DeviceBag | null>(null)
  const [editing, setEditing] = useState<Club | null>(null)
  const read = () => readDeviceBag(fits ? "calibrated" : "handicap", fits?.map((f) => f.club) ?? [])
  useEffect(() => setDevice(read()), [fits]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fitted shots are the golfer's own, so they only back a bag that plays from them.
  const rows = useMemo(() => {
    if (!device) return []
    const { Driver, "7-Iron": seven, ...others } = device.carries
    return buildBagNumbers({
      bag: device.bag,
      fits: device.source === "calibrated" ? fits : null,
      handicap: device.handicap ?? PLAY_START_HANDICAP,
      accountHandicap,
      typed: typedCarries(Driver, seven, others),
    })
  }, [device, fits, accountHandicap])

  if (!device) return <p className="py-6 text-sm text-muted">Loading…</p>

  const home = serverHomeCourse ?? device.course
  const notes = gapNotes(rows)
  const save = (club: Club, carry: number | null) => {
    writeClubCarry(club, carry)
    setEditing(null)
    setDevice(read())
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-fg/[0.06] bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <p className="label-xs">Clubs</p>
          <Link href={EDIT_HREF} className="flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline md:min-h-0">
            Edit
          </Link>
        </div>
        <ul className="mt-1 divide-y divide-fg/[0.04]">
          {rows.map((r) => {
            const note = notes.find((n) => n.upper === r.club)
            return (
              <li key={r.club}>
                <button
                  type="button"
                  aria-expanded={editing === r.club}
                  onClick={() => setEditing(editing === r.club ? null : r.club)}
                  className="flex min-h-[56px] w-full items-center gap-3 px-5 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg">{r.club}</span>
                    <span className="block text-xs text-muted">{sourceLabel(r)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xl font-semibold text-fg tabular-nums">{r.carryYds}</span>
                    <span className="block text-xs text-muted tabular-nums">{r.totalYds} total</span>
                  </span>
                </button>
                {editing === r.club && <ClubEditor row={r} onSave={(c) => save(r.club, c)} onCancel={() => setEditing(null)} />}
                {note && (
                  <p className="px-5 pb-2 text-xs text-warn">
                    {r.club} to {note.lower}: {note.text}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        <p className="px-5 pb-4 pt-2 text-xs text-muted">
          Carry in yards; total adds roll on a fairway. Tap a club to type your own carry.
          {rows.some((r) => r.source === "typical") && (
            <>
              {" "}
              <Link href="/you/bag/shots" className="font-semibold text-accent hover:underline">
                Add your shots
              </Link>
            </>
          )}
        </p>
      </section>

      <WedgeNumbers rows={rows} initial={device.wedgeCarries} />

      <section className="rounded-xl border border-fg/[0.06] bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="label-xs">Home course</p>
            {home && <p className="mt-1 truncate text-sm font-medium text-fg">{home.name}</p>}
          </div>
          <Link href={EDIT_HREF} className="flex min-h-[44px] shrink-0 items-center text-sm font-semibold text-accent hover:underline md:min-h-0">
            {home ? "Change" : "Set home course"}
          </Link>
        </div>
      </section>

      <LinkRow href="/you/bag/shots" title="My shot data" blurb="Upload your real shots so the planner learns your game" />
      <LinkRow href="/you/bag/misses" title="Your misses" blurb="Where each club's shots land" />
    </div>
  )
}
