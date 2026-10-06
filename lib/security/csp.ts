// Content-Security-Policy for pages, built per request by middleware.ts so Next.js's own inline
// scripts can carry a fresh nonce. It is sent REPORT-ONLY (violations are logged in the browser
// console, nothing is blocked); to enforce, rename the header in middleware.ts.
//
// What the app loads, by directive:
//   img-src      Esri World Imagery tiles (components/simulator/CourseMap.tsx)
//   connect-src  Supabase (browser client) and Open-Meteo (hooks/useWind.ts). Realtime is not used, so no wss:.
//                Overpass, OpenGolfAPI and USGS are called by our own /api routes, so they are not listed.
//   worker-src   the service worker (public/sw.js) and the planner Web Worker (plan.worker.ts)
//   style-src    'unsafe-inline' because Leaflet and React write inline style attributes
//   script-src   the per-request nonce ('strict-dynamic' lets Next's scripts load their chunks) plus the
//                sha256 of the inline theme script (lib/theme/themeScript.ts). If that script changes,
//                update THEME_SCRIPT_HASH: `npm test` fails until you do.
//                Current: sha256-3b2VaD3vpu/xv9f1VN+RpN/Z87sGldDYB56YLjuHjtk=

export const THEME_SCRIPT_HASH = "sha256-3b2VaD3vpu/xv9f1VN+RpN/Z87sGldDYB56YLjuHjtk="

export function buildCsp(nonce: string, supabaseUrl: string | undefined): string {
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ""
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' '${THEME_SCRIPT_HASH}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://server.arcgisonline.com",
    "font-src 'self' data:",
    ["connect-src 'self'", supabaseOrigin, "https://api.open-meteo.com"].filter(Boolean).join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}
