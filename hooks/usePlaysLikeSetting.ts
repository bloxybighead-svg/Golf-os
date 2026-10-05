"use client"

// The "Plays like" switch (wind and ground height in the plan), saved on this device. On by default.

import { useCallback, useEffect, useState } from "react"
import { PLAYS_LIKE_EVENT, PLAYS_LIKE_KEY, readPlaysLikeOn, savePlaysLikeOn } from "@/lib/course/windStore"

export function usePlaysLikeSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const sync = () => setOn(readPlaysLikeOn())
    const onStorage = (e: StorageEvent) => {
      if (e.key === PLAYS_LIKE_KEY) sync()
    }
    sync()
    window.addEventListener(PLAYS_LIKE_EVENT, sync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(PLAYS_LIKE_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])
  const set = useCallback((v: boolean) => {
    setOn(v)
    savePlaysLikeOn(v)
  }, [])
  return [on, set]
}
