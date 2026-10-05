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

/** @type {import('next').NextConfig} */
const nextConfig = {
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
