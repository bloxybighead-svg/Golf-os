// The Appearance setting: "system" follows the device, "light"/"dark" pin it.
// Stored per device in localStorage and applied as html[data-theme] -- by an
// inline script in app/layout.tsx before first paint, and live by the toggle.

export type ThemePreference = "system" | "light" | "dark"

export const THEME_STORAGE_KEY = "golf-os-theme"

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === "light" || v === "dark" ? v : "system"
  } catch {
    return "system"
  }
}

export function applyThemePreference(pref: ThemePreference) {
  const root = document.documentElement
  if (pref === "system") delete root.dataset.theme
  else root.dataset.theme = pref
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
}
