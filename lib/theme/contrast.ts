// WCAG 2.x contrast math plus a reader for the color tokens in app/globals.css,
// so a test can fail the build when a theme change drops text below AA.

export type Rgb = [number, number, number]
export type TokenSet = Record<string, Rgb>

/** WCAG AA: 4.5:1 for body text, 3:1 for large text (18pt, or 14pt bold). Source: WCAG 2.1 SC 1.4.3. */
export const AA_BODY = 4.5
export const AA_LARGE = 3

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Reads the `--name: r g b;` declarations out of one CSS block body. */
function parseTokens(body: string): TokenSet {
  const out: TokenSet = {}
  const re = /--([a-z0-9-]+):\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return out
}

function blockBody(css: string, opener: string): string {
  const start = css.indexOf(opener)
  if (start < 0) throw new Error(`globals.css has no block starting with ${opener}`)
  const open = css.indexOf("{", start)
  const close = css.indexOf("}", open)
  return css.slice(open + 1, close)
}

/**
 * The three token sets in globals.css: light (:root), dark by system preference,
 * and dark by explicit override. The dark sets overlay the light one, as in the browser.
 */
export function readThemes(css: string): { light: TokenSet; darkSystem: TokenSet; darkForced: TokenSet } {
  const light = parseTokens(blockBody(css, ":root {"))
  const darkSystem = { ...light, ...parseTokens(blockBody(css, ':root:not([data-theme="light"])')) }
  const darkForced = { ...light, ...parseTokens(blockBody(css, ':root[data-theme="dark"]')) }
  return { light, darkSystem, darkForced }
}

/** Tokens used as text. `faint` is included: it is the placeholder color. */
export const TEXT_TOKENS = ["fg", "fg-2", "fg-3", "muted", "faint", "accent", "danger", "warn", "info"] as const
/** Tokens text is drawn on. */
export const BACKGROUND_TOKENS = ["page", "surface", "surface-2", "surface-3", "surface-4"] as const
