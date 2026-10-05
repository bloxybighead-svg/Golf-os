// Cache Storage names shared by the service worker (app/sw.ts) and the app
// (lib/offline/snapshots.ts). Kept apart so the worker bundle stays free of the app's code.

/** Pages (HTML) the worker has seen, served when the network fails. They hold the signed-in golfer's data, so sign-out deletes them. */
export const PAGES_CACHE = "golfos-pages"
