/// <reference lib="webworker" />
// The service worker (built by Serwist, see next.config.mjs). What it does:
//  - precaches the app's own JS, CSS and icons, so the app opens with no signal;
//  - serves pages network first (4 s), falling back to the last copy it saw, and
//    to /offline when it has never seen the page;
//  - waits (does not skip waiting) when a new version installs, so the app can offer
//    "Update available" and never reloads a round out from under the golfer.
//
// What it deliberately does NOT touch: API calls, Supabase, and every cross-origin
// request. In particular satellite tiles (server.arcgisonline.com) are never stored:
// Esri's World Imagery terms do not allow offline copies. The planner's own data is
// kept in IndexedDB by the app (lib/offline/).

import { ExpirationPlugin, NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist"
import { PAGES_CACHE } from "@/lib/offline/cacheNames"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/** How long a page waits for the network before the saved copy is used. An estimate: long enough for a slow connection, short enough that a dead one does not hang the app. */
const PAGE_NETWORK_TIMEOUT_S = 4
/** Pages kept. An estimate: the app has about ten routes. */
const MAX_PAGES = 24

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin, url }) => sameOrigin && request.mode === "navigate" && !url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        networkTimeoutSeconds: PAGE_NETWORK_TIMEOUT_S,
        plugins: [new ExpirationPlugin({ maxEntries: MAX_PAGES })],
      }),
    },
  ],
  fallbacks: { entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }] },
})

serwist.addEventListeners()

// The app asks the waiting worker to take over when the golfer taps "Update".
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting()
})
