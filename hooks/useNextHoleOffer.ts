"use client"

// "On hole 8?": offers the next hole once the golfer's accepted GPS fix has stayed near its tee
// (lib/rounds/holeOffer.ts). It only ever offers; moving to the hole is the golfer's tap.

import { useEffect, useRef, useState } from "react"
import type { LatLng } from "@/lib/course/geo"
import type { GpsFix } from "@/lib/course/gps"
import { OFFER_DWELL_MS, trackDwell, withinOfferRadius } from "@/lib/rounds/holeOffer"

export function useNextHoleOffer(fix: GpsFix | null, target: { holeNumber: number; tee: LatLng } | null) {
  const [offer, setOffer] = useState<number | null>(null)
  const since = useRef<number | null>(null)
  const answered = useRef(new Set<number>()) // taken or let go: not offered again
  const holeNumber = target?.holeNumber ?? null
  const teeLat = target?.tee.lat
  const teeLng = target?.tee.lng

  useEffect(() => {
    since.current = null
    setOffer(null)
  }, [holeNumber])

  useEffect(() => {
    if (!fix || holeNumber == null || teeLat == null || teeLng == null || answered.current.has(holeNumber)) {
      since.current = null
      return
    }
    since.current = trackDwell(since.current, withinOfferRadius(fix, { lat: teeLat, lng: teeLng }), fix.t)
    if (since.current == null) return
    // A phone that stands still may stop reporting, so the offer waits on a timer, not on the next fix.
    const id = setTimeout(() => setOffer(holeNumber), Math.max(0, since.current + OFFER_DWELL_MS - Date.now()))
    return () => clearTimeout(id)
  }, [fix, holeNumber, teeLat, teeLng])

  function answer() {
    if (offer != null) answered.current.add(offer)
    setOffer(null)
  }

  return { offer, answer }
}
