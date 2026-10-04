"use client"

// Upload a CSV: detect the format (or map the columns by hand), say what kind of
// session it was, review the shots that look like partials or mishits, save.

import { useMemo, useRef, useState } from "react"
import { Upload } from "lucide-react"
import {
  DEFAULT_SETTINGS,
  ImportError,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROWS,
  detectFormat,
  isCompleteMapping,
  parseDetected,
  parseUpload,
  type ColumnMapping,
  type Detected,
  type ImportSettings,
} from "@/lib/shots/importCsv"
import { clubCounts, keptShots, reviewShots } from "@/lib/shots/review"
import type { NewSession, ParsedShot } from "@/lib/shots/types"
import { BUTTON, BUTTON_PRIMARY, CARD, INPUT, SessionFields, todayIso } from "./ui"

const FIELDS: { key: keyof ColumnMapping; label: string; required?: string }[] = [
  { key: "club", label: "Club", required: "club" },
  { key: "carry", label: "Carry distance", required: "carry" },
  { key: "offline", label: "Offline / side distance" },
  { key: "launchDir", label: "Launch direction (start line)" },
  { key: "curve", label: "Curve" },
  { key: "partial", label: "Partial swing (yes/no)" },
  { key: "date", label: "Date" },
]

interface Loaded {
  rows: string[][]
  fileName: string
  detected: Detected
}

export function ImportFlow({ busy, onSave }: { busy: boolean; onSave: (session: NewSession, shots: ParsedShot[]) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [settings, setSettings] = useState<ImportSettings>(DEFAULT_SETTINGS)
  const [meta, setMeta] = useState<NewSession>({ label: "", date: todayIso(), environment: "outdoor", surface: "mat" })
  const [overrides, setOverrides] = useState<Record<number, boolean>>({})
  const [error, setError] = useState("")

  async function pick(file: File | undefined) {
    if (!file) return
    setError("")
    try {
      if (file.size > MAX_UPLOAD_BYTES) throw new ImportError(`That file is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
      const rows = parseUpload(await file.text(), file.size)
      const detected = detectFormat(rows)
      const m = detected.kind === "table" ? detected.mapping : null
      const parsed = parseDetected(rows, detected, m ?? ({} as ColumnMapping), DEFAULT_SETTINGS)
      setLoaded({ rows, fileName: file.name, detected })
      setMapping(m)
      setSettings({ ...DEFAULT_SETTINGS, distanceUnit: detected.kind === "table" && detected.unitHint ? detected.unitHint : "yd" })
      setMeta((prev) => ({ ...prev, label: file.name.replace(/\.[^.]+$/, ""), date: parsed.date ?? todayIso() }))
      setOverrides({})
    } catch (e) {
      setLoaded(null)
      setError(e instanceof ImportError ? e.message : "Couldn't read that file as a CSV.")
    }
    if (input.current) input.current.value = ""
  }

  const mapped = loaded && (loaded.detected.kind === "session-summary" || (mapping && isCompleteMapping(mapping)))
  const result = useMemo(() => (loaded && mapped ? parseDetected(loaded.rows, loaded.detected, mapping ?? ({} as ColumnMapping), settings) : null), [loaded, mapped, mapping, settings])
  const review = useMemo(() => (result ? reviewShots(result.shots).map((r, i) => ({ ...r, excluded: overrides[i] ?? r.excluded })) : []), [result, overrides])
  const counts = clubCounts(review)
  const kept = keptShots(review)
  const flagged = review.map((r, i) => ({ r, i })).filter((x) => x.r.flag)

  function reset() {
    setLoaded(null)
    setMapping(null)
    setOverrides({})
    setError("")
  }

  async function save() {
    try {
      setError("")
      await onSave({ ...meta, label: meta.label.trim() }, kept)
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.")
    }
  }

  return (
    <section className={CARD}>
      <h2 className="text-sm font-semibold text-fg">Upload a CSV</h2>
      <p className="mt-1 text-xs text-muted">
        From a launch monitor or your own spreadsheet: needs a club, a carry, and a side or start-line column. Up to 2 MB / {MAX_UPLOAD_ROWS.toLocaleString()} rows.
      </p>

      {!loaded && (
        <div className="mt-3">
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" className={BUTTON_PRIMARY} onClick={() => input.current?.click()} disabled={busy}>
            <span className="inline-flex items-center gap-2">
              <Upload size={16} />
              Choose file
            </span>
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {loaded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-fg-3">
            {loaded.fileName}:{" "}
            {loaded.detected.kind === "session-summary"
              ? "recognised the session-summary export"
              : mapped
                ? "columns found"
                : "I couldn't tell which columns are which. Pick them below."}
          </p>

          {loaded.detected.kind === "table" && mapping && (
            <details open={!mapped} className="rounded-lg border border-fg/[0.06] p-3">
              <summary className="cursor-pointer text-xs font-medium text-fg-2">Columns</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted">{f.label}</span>
                    <select className={INPUT} value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                      <option value={-1}>{f.required ? "Choose…" : "(none)"}</option>
                      {loaded.detected.kind === "table" &&
                        loaded.detected.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              {!mapped && <p className="mt-3 text-xs text-warn">Needs a club, a carry, and either an offline or a launch-direction column.</p>}
            </details>
          )}

          {mapped && result && (
            <>
              {loaded.detected.kind === "table" && (
                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted">Distances are in</span>
                    <select className={INPUT} value={settings.distanceUnit} onChange={(e) => setSettings({ ...settings, distanceUnit: e.target.value as "yd" | "m" })}>
                      <option value="yd">Yards</option>
                      <option value="m">Metres</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-xs text-fg-2 md:pb-1.5">
                    <input type="checkbox" checked={settings.leftIsNegative} onChange={(e) => setSettings({ ...settings, leftIsNegative: e.target.checked })} />
                    Left misses are negative numbers (untick if left is positive)
                  </label>
                </div>
              )}

              <SessionFields value={meta} onChange={setMeta} />

              <div>
                <p className="text-xs font-medium text-fg-2">
                  {result.shots.length} shots found{result.skipped > 0 && `, ${result.skipped} rows skipped (no usable carry or direction)`}
                </p>
                {Object.keys(result.unknownClubs).length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    Ignored clubs the planner doesn&rsquo;t have:{" "}
                    {Object.entries(result.unknownClubs)
                      .map(([c, n]) => `${c} (${n})`)
                      .join(", ")}
                    .
                  </p>
                )}
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-muted">
                        <th className="py-1 pr-3 font-medium">Club</th>
                        <th className="px-3 py-1 font-medium">Shots</th>
                        <th className="px-3 py-1 font-medium">Flagged</th>
                        <th className="px-3 py-1 font-medium">Will save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {counts.map((c) => (
                        <tr key={c.club} className="border-t border-fg/[0.04] text-fg-2">
                          <td className="py-1 pr-3 text-fg">{c.club}</td>
                          <td className="px-3 py-1">{c.total}</td>
                          <td className="px-3 py-1">{c.flagged}</td>
                          <td className="px-3 py-1">{c.kept}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {flagged.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-fg-2">Flagged shots ({flagged.length}): tick to leave out</p>
                  <p className="mt-1 text-xs text-muted">
                    Short of the club&rsquo;s usual carry: likely a partial swing, a top or a duff. They start ticked. Untick any that were real full swings.
                  </p>
                  <ul className="mt-2 max-h-56 divide-y divide-fg/[0.04] overflow-y-auto rounded-lg border border-fg/[0.06]">
                    {flagged.slice(0, 300).map(({ r, i }) => (
                      <li key={i}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-xs text-fg-2">
                          <input type="checkbox" checked={r.excluded} onChange={(e) => setOverrides({ ...overrides, [i]: e.target.checked })} />
                          <span className="w-16 text-fg">{r.shot.club}</span>
                          <span className="tabular-nums">{r.shot.carryYds.toFixed(0)} yd</span>
                          <span className="tabular-nums text-muted">{r.shot.offlineYds >= 0 ? `${r.shot.offlineYds.toFixed(0)} R` : `${Math.abs(r.shot.offlineYds).toFixed(0)} L`}</span>
                          <span className="ml-auto text-muted">{r.flag === "outlier" ? "far short: top or duff?" : "partial?"}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" className={BUTTON_PRIMARY} disabled={busy || kept.length === 0 || meta.label.trim() === ""} onClick={save}>
                  {busy ? "Saving…" : `Save ${kept.length} shots`}
                </button>
                <button type="button" className={BUTTON} onClick={reset} disabled={busy}>
                  Cancel
                </button>
              </div>
            </>
          )}
          {!mapped && (
            <button type="button" className={BUTTON} onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      )}
    </section>
  )
}
