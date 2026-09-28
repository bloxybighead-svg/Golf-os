import { useCallback, useEffect, useState } from "react"

/**
 * Color tokens for places a Tailwind class can't reach: inline styles, SVG
 * attributes (recharts, the dispersion plots), and Leaflet layer options.
 * Values come from the CSS variables in app/globals.css, so there is still
 * exactly one place colors are defined.
 */

/** A token as a CSS color string, for `style={{...}}` and HTML strings. Follows the theme live. */
export function cssColor(name: string, alpha = 1): string {
  return `rgb(var(--${name}) / ${alpha})`
}

/** Resolves a token to a concrete color right now (client only). */
export function readColor(name: string, alpha = 1): string {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  return channels ? `rgb(${channels} / ${alpha})` : cssColor(name, alpha)
}

/**
 * Returns `color(name, alpha?)` for SVG/chart attributes, re-rendering the
 * caller when the theme changes. It resolves to concrete values after mount
 * rather than handing out `var()` strings, because not every browser (older
 * Safari in particular) resolves CSS variables inside SVG presentation
 * attributes. Before mount it falls back to the var() form.
 */
export function useThemeColor() {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    bump()
    const observer = new MutationObserver(bump)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", bump)
    return () => {
      observer.disconnect()
      media.removeEventListener("change", bump)
    }
  }, [])

  return useCallback(
    (name: string, alpha = 1) => (version === 0 ? cssColor(name, alpha) : readColor(name, alpha)),
    [version]
  )
}
