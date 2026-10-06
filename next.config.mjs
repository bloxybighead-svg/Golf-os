import { randomUUID } from "node:crypto"
import withSerwistInit from "@serwist/next"

// Service worker (app/sw.ts -> public/sw.js). Off in `next dev` so it cannot fight hot reload;
// registered by components/pwa/OfflineProvider.tsx so the app can show "Update available".
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: false,
  reloadOnOnline: false,
  // The offline page must be saved at install time; a new revision each build refreshes it.
  additionalPrecacheEntries: [{ url: "/offline", revision: randomUUID() }],
})

// Security headers on every response (pages and /api).
//
// The Content-Security-Policy is REPORT-ONLY: the browser logs violations to the console but blocks
// nothing. What the app loads, by directive:
//   img-src      Esri World Imagery tiles (components/simulator/CourseMap.tsx)
//   connect-src  Supabase (NEXT_PUBLIC_SUPABASE_URL, browser client) and Open-Meteo (hooks/useWind.ts).
//                Realtime is not used, so no wss:. Overpass, OpenGolfAPI and USGS are called by our own
//                /api routes (server side), so they are not listed.
//   worker-src   the service worker (public/sw.js) and the planner Web Worker (plan.worker.ts, blob: bundle)
//   style-src    'unsafe-inline' because Leaflet and React inline style attributes
//   script-src   'self' plus the sha256 of the inline theme script (lib/theme/themeScript.ts).
//                If that script changes, update the hash below: `npm test` fails until you do.
//                Current hash is of THEME_INIT_SCRIPT: sha256-3b2VaD3vpu/xv9f1VN+RpN/Z87sGldDYB56YLjuHjtk=
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ""

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'sha256-3b2VaD3vpu/xv9f1VN+RpN/Z87sGldDYB56YLjuHjtk='",
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

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The planner's Follow-GPS needs geolocation for our own origin only.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
  // Pages retired by the three-tab nav (Play, Rounds, You); keep old links working.
  async redirects() {
    return [
      // Practice tab -> You
      { source: "/log", destination: "/you", permanent: false },
      { source: "/drills", destination: "/you", permanent: false },
      { source: "/trends", destination: "/you", permanent: false },
      // The planner is the Play tab itself now
      { source: "/planner", destination: "/", permanent: false },
      // Course Planner sub-tabs -> the matching tool on /you/bag
      { source: "/planner/dispersion", destination: "/you/bag?view=dispersion", permanent: false },
      { source: "/planner/compare", destination: "/you/bag?view=compare", permanent: false },
      { source: "/planner/custom", destination: "/you/bag?view=custom", permanent: false },
      { source: "/planner/tbox", destination: "/you/bag?view=tbox", permanent: false },
      // The original /simulator pages, which later became Course Planner sub-tabs
      { source: "/simulator", destination: "/you/bag?view=dispersion", permanent: false },
      { source: "/simulator/course", destination: "/", permanent: false },
      { source: "/simulator/:view(dispersion|compare|custom|tbox)", destination: "/you/bag?view=:view", permanent: false },
    ];
  },
};

export default withSerwist(nextConfig);
