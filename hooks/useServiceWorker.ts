"use client"

// Registers the service worker and reports when a newer version is waiting.
// `applyUpdate` makes the waiting worker take over and reloads once it has.
// Production only: in `next dev` the worker is not built.

import { useCallback, useEffect, useRef, useState } from "react"

/** How often an open app checks for a new version. An estimate: a round lasts about four hours; hourly is enough and cheap. */
const UPDATE_CHECK_MS = 60 * 60_000

export function useServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const reloading = useRef(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    let timer: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    // A worker that is waiting while another one controls the page is an update.
    // With no controller it is the first install, which needs no prompt.
    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting)
      reg.addEventListener("updatefound", () => {
        const next = reg.installing
        next?.addEventListener("statechange", () => {
          if (next.state === "installed" && navigator.serviceWorker.controller) setWaiting(reg.waiting ?? next)
        })
      })
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return
        watch(reg)
        timer = setInterval(() => void reg.update().catch(() => {}), UPDATE_CHECK_MS)
      })
      .catch(() => {
        /* no worker (blocked, private mode): the app works online as before */
      })

    const onController = () => {
      if (reloading.current) location.reload()
    }
    navigator.serviceWorker.addEventListener("controllerchange", onController)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      navigator.serviceWorker.removeEventListener("controllerchange", onController)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    if (!waiting) return
    reloading.current = true // only reload because the golfer tapped, never on its own
    waiting.postMessage({ type: "SKIP_WAITING" })
  }, [waiting])

  return { updateAvailable: waiting !== null, applyUpdate }
}
