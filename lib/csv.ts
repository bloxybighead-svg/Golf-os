// Client-side CSV generation shared by the Trends and Log exports.

export function csvCell(value: unknown): string {
  if (value == null) return ""
  const s = Array.isArray(value) ? value.join("; ") : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","))
  }
  return lines.join("\r\n")
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
