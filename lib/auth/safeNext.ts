/**
 * Where to send someone after signing in. Only same-site paths are allowed:
 * "/rounds?new=1" yes; "https://evil.example", "//evil.example" and "/\evil.example" no
 * (browsers treat the last two as other sites). Anything else falls back.
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/")) return fallback
  if (raw.startsWith("//") || raw.includes("\\")) return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback
  return raw
}

/** A sign-in link that returns to `path` afterwards. */
export function loginHref(path: string): string {
  return `/login?next=${encodeURIComponent(safeNext(path))}`
}
