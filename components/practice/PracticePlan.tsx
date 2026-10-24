"use client"

// The top of the Practice page: the week, and the way into a session. One read of the week feeds both.

import { usePracticeWeek } from "@/hooks/usePracticeWeek"
import type { ClubFit } from "@/lib/golfer/shotProfile"
import type { DrillRef, FinishedRun } from "@/lib/practice/runs"
import type { LibraryDrill } from "@/lib/supabase/types"
import type { SgRoundData } from "@/lib/supabase/loadSgData"
import { StartSession } from "./StartSession"
import { WeekCardView } from "./WeekCard"

export function PracticePlan(props: {
  sgData: SgRoundData[]
  fits: ClubFit[] | null
  handicapIndex: number | null
  savedRuns: FinishedRun[]
  library: DrillRef[]
  activeLibrary: LibraryDrill[]
  levels: Record<string, number>
  levelSince: Record<string, string>
  userId: string | null
}) {
  const week = usePracticeWeek({ sgData: props.sgData, fits: props.fits, handicapIndex: props.handicapIndex, savedRuns: props.savedRuns, library: props.library })
  return (
    <>
      {week && <WeekCardView week={week} />}
      <StartSession week={week} library={props.library} activeLibrary={props.activeLibrary} levels={props.levels} levelSince={props.levelSince} userId={props.userId} />
    </>
  )
}
