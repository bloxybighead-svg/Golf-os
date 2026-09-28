// The app's name, in one place: the top-bar wordmark, the browser tab title and
// the home-screen app name (manifest) all read it. Renaming the app is this line
// plus "name" in package.json.
export const APP_NAME = "Golf OS"

// Literal brand colors for the few places CSS variables can't reach: the web
// app manifest, the browser's theme-color meta tag, and public/icon.svg. Every
// other color lives in app/globals.css. Keep these matched to --page (both
// themes) and --accent there.
export const BRAND = {
  dark: "#0a0a0a",
  light: "#f7f6f2",
  accent: "#22c55e",
} as const
