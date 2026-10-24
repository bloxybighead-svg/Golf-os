"use client"

// Strokes gained for rounds loaded on the server (loadSgData), worked out in the
// browser because the comparison level and the bag live on the device.

import { useEffect, useMemo, useState } from "react"
import { buildBagNumbers } from "@/lib/you/bagNumbers"
import { readDeviceBag, type DeviceBag } from "@/lib/you/deviceBag"
import { typedCarries } from "@/lib/golfer/bagShots"
import type { ClubFit } from "@/lib/golfer/shotProfile"
import { DEFAULT_BASELINE_HANDICAP } from "@/lib/course/baseline"
import { baselineFor, readSgCompare, SCRATCH, SG_COMPARE_KEY, SG_SETTINGS_EVENT, type SgCompare } from "@/lib/rounds/sgSettings"
import { resolveHoleYards } from "@/lib/rounds/sgEstimate"
import { roundSg, type RoundSgResult } from "@/lib/rounds/roundSg"
import type { SgRoundData } from "@/lib/supabase/loadSgData"

export interface SgInputs {
  /** False until the device's settings have been read; nothing is worked out before. */
  ready: boolean
  compare: SgCompare
  /** How the level reads on screen: "scratch", "your 3.4 handicap". */
  label: string
  results: RoundSgResult[]
}

export function useSgResults(data: readonly SgRoundData[], fits: ClubFit[] | null, ownHandicap: number | null): SgInputs {
  const [compare, setCompare] = useState<SgCompare>(SCRATCH)
  const [device, setDevice] = useState<DeviceBag | null>(null)

  useEffect(() => {
    const read = () => {
      setCompare(readSgCompare())
      setDevice(readDeviceBag(fits ? "calibrated" : "handicap", fits?.map((f) => f.club) ?? []))
    }
    const onStorage = (e: StorageEvent) => e.key === SG_COMPARE_KEY && read()
    read()
    window.addEventListener(SG_SETTINGS_EVENT, read)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(SG_SETTINGS_EVENT, read)
      window.removeEventListener("storage", onStorage)
    }
  }, [fits])

  const driverTotalYds = useMemo(() => {
    if (!device) return null
    const { Driver, "7-Iron": seven, ...others } = device.carries
    const rows = buildBagNumbers({
      bag: device.bag,
      fits: device.source === "calibrated" ? fits : null,
      handicap: device.handicap ?? DEFAULT_BASELINE_HANDICAP,
      accountHandicap: ownHandicap,
      typed: typedCarries(Driver, seven, others),
    })
    return rows.find((r) => r.club === "Driver")?.totalYds ?? null
  }, [device, fits, ownHandicap])

  const { baseline, label } = useMemo(() => baselineFor(compare, ownHandicap), [compare, ownHandicap])
  const results = useMemo(
    () =>
      device
        ? data.map((d) =>
            roundSg(d.round, d.holes, d.shots, {
              baseline,
              driverTotalYds,
              yardsFor: (n, par) => resolveHoleYards({ par, holeYds: d.yards.holes[n] ?? null, courseTotalYds: d.yards.course }),
            })
          )
        : [],
    [data, device, baseline, driverTotalYds]
  )
  return { ready: device !== null, compare, label, results }
}
