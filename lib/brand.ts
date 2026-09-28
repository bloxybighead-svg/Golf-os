// Literal brand colors for the few places CSS variables can't reach: the web
// app manifest, the browser's theme-color meta tag, and public/icon.svg. Every
// other color lives in app/globals.css. Keep these matched to --page (both
// themes) and --accent there.
export const BRAND = {
  dark: "#0a0a0a",
  light: "#f7f6f2",
  accent: "#22c55e",
} as const
