/** The local calendar date as YYYY-MM-DD (not the UTC date, which is wrong every US evening). */
export function localISODate(d: Date = new Date()): string {
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${month}-${day}`
}
