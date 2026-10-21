import { parseScorecard, type Scorecard } from "./scorecard"

// Free, keyless, ODbL-licensed: https://opengolfapi.org/
const OPENGOLFAPI_BASE = "https://api.opengolfapi.org/api/v1"

/** How long a lookup waits before giving up. ESTIMATE: strokes gained works without yardage, so a slow API should not hold a page. */
const TIMEOUT_MS = 4000

/** A course's scorecard from OpenGolfAPI, or null when the lookup fails. */
export async function fetchScorecard(courseId: string): Promise<Scorecard | null> {
  try {
    const res = await fetch(`${OPENGOLFAPI_BASE}/courses/${encodeURIComponent(courseId)}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok ? parseScorecard(await res.json()) : null
  } catch {
    return null
  }
}
