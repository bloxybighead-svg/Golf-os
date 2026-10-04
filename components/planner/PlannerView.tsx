"use client"

// Draws the Play planner page from usePlannerController's state: title line,
// notices, Play round, map column, result card and club table, phone sheet,
// course picker and the hole-correction dialog. Moved verbatim from
// CourseMapClient.tsx.

import { useEffect, useState } from "react"
import type { PlannerProps as Props } from "@/lib/planner/types"
import { hasSeenIntro, markIntroSeen, shouldShowIntro } from "@/lib/planner/intro"
import { loadActiveRound } from "@/lib/rounds/activeRound"
import { IntroCards } from "@/components/planner/IntroCards"
import type { PlannerVM } from "@/hooks/usePlannerController"
import Link from "next/link"
import { MAP_TAP_GUARD_MS } from "@/lib/planner/clubChoice"
import { ChevronUp, Loader2, X } from "lucide-react"
import dynamic from "next/dynamic"
import { distanceYds } from "@/lib/course/geo"
import { dismissed as promptDismissed, readPrompt, writePrompt } from "@/lib/planner/setupPrompt"
import { useIsPhone } from "@/hooks/useIsPhone"
import { StrategyToggle } from "@/components/planner/StrategyToggle"
import { EditHoleModal } from "@/components/simulator/EditHoleModal"
import { TeeLine } from "@/components/simulator/TeeLine"
import { PlayRound } from "@/components/play/PlayRound"
import { saveZoom } from "@/lib/planner/storage"
import { ScoringDetails } from "@/components/planner/ScoringDetails"
import { ClubTable } from "@/components/planner/ClubTable"
import { ResultCard } from "@/components/planner/ResultCard"
import { LayersMenu } from "@/components/planner/LayersMenu"
import { HoleHeader } from "@/components/planner/HoleHeader"
import { ClubSheet } from "@/components/planner/ClubSheet"
import { ClubChips } from "@/components/planner/ClubChips"
import { ObBanner } from "@/components/planner/ObBanner"
import { WindControl } from "@/components/planner/WindControl"
import { CoursePickerSheet } from "@/components/planner/CoursePickerSheet"
import { MapView } from "@/components/planner/MapView"

const CourseMap = dynamic(() => import("@/components/simulator/CourseMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-muted">Loading map…</div>,
})

export function PlannerView({ vm, calibrated, calibratedName, myProfile = null, trackedHandicap }: { vm: PlannerVM } & Omit<Props, "baseline">) {
  const {
    offlineReport,
    mapTapGuardUntil,
    loadNeedsSignIn, searchError,
    addDrawPoint, aim, aimAtBest, aimIsPin, aimManual, aimToPin, atBestAim, authUser, avgLeft, bag,
    bagDriverCarry, ball, baselineHandicap, best, cancelDraw, changePlayView, changeRound, holeTitle, headerCourseName,
    chooseCourse, chosen, chosenAtAim, chosenLive, clubChoice, correctionNote, correctionSubmitting, course,
    deleteZone, distAim, distPin, drawKind, driverCarry, editingHole, estimateNotes, extraCarries, finishDraw,
    fit, following, fromLabel, geometry, goToHoleNumber, gpsAccuracyYds, gpsError, gpsNote, handicap,
    hasCourseProblems, hits, hole, holeBearingDeg, holeId, holeLabel, holeQuality, holes, hydrated,
    initialZoom, labels, landings, layersMenuPos, layersMenuRef, loadCourse, loadError, loadState,
    localOnlyZones, longestCarry, mapWrapRef, moveBallTo, pendingPoints, pickClub, pickHole, pickerOpen, pin,
    placing, planReady, playView, query, rankState, ranking, rankingPending, recent, refreshCourseData,
    refreshing, rings, round, roundHere, scoreBaseline, scoring, searched, searching, setAimManual,
    setClubChoice, setDriverCarry, setEditingHole, setHandicap, setHazardConfirmed, setLayersMenuPos,
    optionsNote, obBands, obTags, holeObTags, noObMapped,
    setLocalOnlyZones, setPickerOpen, setPinManual, setPlacing, setQuery, setSevenIronCarry, setSheetOpen,
    setShowCarry, setShowLayersMenu, setShowMarks, setShowRings, setShowSetupPrompt, setShowTrouble,
    setShowZones, setSource, setTendency, sevenIronCarry, sheetOpen, showCarry, showLayersMenu, showMarks,
    showRings, showSetupPrompt, showTrouble, showZones, shownLies, source, startDraw, stats, stepHole,
    stopFollowing, submitHoleCorrection, syncLocalZonesToAccount, syncingZones, tendency, toggleClub,
    toggleFollow, troubleCells, undoDrawPoint, useMyLocation, zones,
    pinPlaysLike, wind, playsLikeOn, setPlaysLikeOn, hasElevation,
  } = vm

  // First-visit intro: decided once, when Play first renders in the browser.
  // Never mid-round (read straight from storage, not from state that may not
  // have loaded yet), and skipping or finishing both mark it seen.
  const [introOpen, setIntroOpen] = useState(false)
  useEffect(() => {
    if (shouldShowIntro({ seen: hasSeenIntro(), roundActive: loadActiveRound() != null })) setIntroOpen(true)
  }, [])
  function closeIntro() {
    markIntroSeen()
    setIntroOpen(false)
  }

  const planCard =
    best && chosen && chosenLive ? (
      <>
      {noObMapped && holeId && <ObBanner onAnswer={(a) => void obTags.answer(holeId, a)} />}
      <ClubChips ranking={ranking} chosen={chosen} onPick={pickClub} className="hidden md:flex -mx-1 mb-2 gap-1.5 px-1 pb-1" />
      <ResultCard
        best={best}
        chosen={chosen}
        chosenLive={chosenLive}
        clubChoice={clubChoice}
        fromLabel={fromLabel}
        hole={hole}
        baselineHandicap={baselineHandicap}
        atBestAim={atBestAim}
        chosenAtAim={chosenAtAim}
        distAim={distAim}
        distPin={distPin}
        aimToPin={aimToPin}
        aimIsPin={aimIsPin}
        avgLeft={avgLeft}
        estimateNotes={estimateNotes}
        holeQuality={holeQuality}
        geometry={geometry}
        onEditHole={() => setEditingHole(true)}
        onStartDraw={startDraw}
        onConfirmHazard={setHazardConfirmed}
        onAimAtBest={aimAtBest}
        onBackToBest={() => {
          setClubChoice("auto")
          aimAtBest(best)
        }}
        options={optionsNote}
        onPickOption={pickClub}
        shotsLabel={source === "calibrated" ? "My shots" : source === "legacy" ? `${calibratedName} (old data)` : "Handicap estimate"}
        pinPlaysLike={pinPlaysLike}
      />
      <WindControl wind={wind} holeBearingDeg={holeBearingDeg} playsLikeOn={playsLikeOn} onPlaysLikeChange={setPlaysLikeOn} hasElevation={hasElevation} />
      </>
    ) : null

  // No hole lines to stand on: the golfer places the ball and pin by hand.
  const placePrompt =
    course && geometry && !planReady ? (
      <p className="py-2 text-sm text-fg-3">{!ball ? "Tap the map to place the ball." : "Now tap to place the pin."}</p>
    ) : null

  const clubTable = (
    <ClubTable
      ranking={ranking}
      pending={rankingPending}
      rankMs={rankState.ms}
      shownLies={shownLies}
      best={best}
      chosen={chosen}
      estimateNotes={estimateNotes}
      baselineLabel={scoreBaseline.label}
      onPick={(r) => {
        mapTapGuardUntil.current = Date.now() + MAP_TAP_GUARD_MS // the closing tap must not reach the map
        pickClub(r)
        setSheetOpen(false)
      }}
    />
  )

  const scoringDetails = (
    <ScoringDetails baselineHandicap={baselineHandicap} onCourseSpread={vm.onCourseSpread} onShowIntro={() => setIntroOpen(true)} />
  )

  const layersMenu = showLayersMenu && layersMenuPos && (
    <LayersMenu
      pos={layersMenuPos}
      onClose={() => setShowLayersMenu(false)}
      onMyLocation={useMyLocation}
      onToggleFollow={toggleFollow}
      following={following}
      gpsAccuracyYds={gpsAccuracyYds}
      gpsNote={gpsNote}
      showTrouble={showTrouble}
      onToggleTrouble={() => setShowTrouble((v) => !v)}
      showRings={showRings}
      onToggleRings={() => setShowRings((v) => !v)}
      showCarry={showCarry}
      onToggleCarry={() => setShowCarry((v) => !v)}
      hasZones={zones.length > 0}
      showZones={showZones}
      onToggleZones={() => setShowZones((v) => !v)}
      drawKind={drawKind}
      onStartDraw={startDraw}
    />
  )

  const pickerSheet = pickerOpen && (
    <CoursePickerSheet
      onClose={() => setPickerOpen(false)}
      query={query}
      onQueryChange={setQuery}
      searching={searching}
      searched={searched}
      searchError={searchError}
      hits={hits}
      onChooseCourse={chooseCourse}
      course={course}
      holes={holes}
      holeId={holeId}
      onPickHole={pickHole}
      recent={recent}
      calibrated={calibrated}
      calibratedName={calibratedName}
      mySessions={myProfile ? myProfile.sessionCount : null}
      source={source}
      onSourceChange={(v) => {
        setSource(v) // a picked club not in the new bag goes back to auto (usePlan)
      }}
      handicap={handicap}
      onHandicapChange={setHandicap}
      driverCarry={driverCarry}
      onDriverCarryChange={setDriverCarry}
      sevenIronCarry={sevenIronCarry}
      onSevenIronCarryChange={setSevenIronCarry}
      tendency={tendency}
      onTendencyChange={setTendency}
      extraCarries={extraCarries}
      bag={bag}
      onToggleClub={toggleClub}
      estimateNotes={estimateNotes}
      geometry={geometry}
      stats={stats}
      hasCourseProblems={hasCourseProblems}
      refreshing={refreshing}
      onRefresh={refreshCourseData}
    />
  )

  const mapContent =
    course?.lat != null && course.lng != null ? (
      <CourseMap
        center={{ lat: course.lat, lng: course.lng }}
        geometry={geometry}
        selectedHoleId={holeId}
        ball={ball}
        aim={aim}
        pin={pin}
        landings={landings}
        showCarry={showCarry}
        cells={troubleCells}
        rings={rings}
        zones={showZones ? zones : []}
        obEdges={obBands.map((b) => b.edge)}
        drawKind={drawKind}
        pendingPoints={pendingPoints}
        labels={labels}
        placing={placing}
        fit={fit}
        fitKey={fit.key}
        initialZoom={initialZoom}
        onZoomChange={(z) => course && saveZoom(course.id, z)}
        holeBearingDeg={holeBearingDeg}
        wind={playsLikeOn ? wind.wind : null}
        onBall={(p) => {
          if (Date.now() < mapTapGuardUntil.current) return
          stopFollowing()
          moveBallTo(p)
          if (!pin) setPlacing("pin") // no hole to take a pin from: the next tap places it
        }}
        onAim={(p) => {
          if (Date.now() < mapTapGuardUntil.current) return
          setAimManual(p)
        }}
        onPin={(p) => {
          if (Date.now() < mapTapGuardUntil.current) return
          setPinManual(p)
        }}
        onPickHole={(id) => {
          if (Date.now() < mapTapGuardUntil.current) return
          const h = holes.find((x) => x.id === id)
          if (h) pickHole(h)
        }}
        onDrawPoint={addDrawPoint}
        onDrawClose={finishDraw}
      />
    ) : (
      <div className="flex h-full items-center justify-center">
        {loadState === "loading" && !course ? (
          <Loader2 size={20} className="animate-spin text-muted" />
        ) : (
          <button
            onClick={() => setPickerOpen(true)}
            className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent"
          >
            Find a course
          </button>
        )}
      </div>
    )

  const phone = useIsPhone()
  const [savedNote, setSavedNote] = useState(false)
  const roundSource = bagDriverCarry ?? (longestCarry > 0 ? longestCarry : null)

  // Messages that sit over the top-left of the map, so they never push it down or around.
  const notices = (
    <>
      {showSetupPrompt && (
        <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-white/20 bg-black/70 pl-3 text-sm text-white">
          <span>Plan with your own clubs.</span>
          <span className="flex shrink-0 items-center">
            <Link href="/welcome" className="flex h-9 items-center px-2 font-semibold text-accent-hi hover:underline">
              Set up
            </Link>
            <button
              onClick={() => {
                setShowSetupPrompt(false)
                writePrompt(promptDismissed(readPrompt().state)) // collapses to a dot on the You tab
              }}
              aria-label="Dismiss"
              className="flex h-9 w-9 items-center justify-center text-white/70 hover:text-white"
            >
              <X size={16} />
            </button>
          </span>
        </div>
      )}
      {loadState === "loading" && course && (
        <p className="flex w-fit items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
          <Loader2 size={12} className="animate-spin" /> {loadError || "Loading course…"}
        </p>
      )}
      {loadState === "error" && course && (
        <p className="rounded-md bg-black/75 px-2 py-1 text-xs text-white">
          {loadError}{" "}
          {loadNeedsSignIn ? (
            <Link href="/login?redirect=%2F" className="font-semibold underline">
              Sign in
            </Link>
          ) : (
            <button onClick={() => loadCourse(course, { autoFirstHole: true })} className="font-semibold underline">
              Retry
            </button>
          )}
        </p>
      )}
      {loadState === "idle" && loadError && <p className="rounded-md bg-black/70 px-2 py-1 text-xs text-white">{loadError}</p>}
    </>
  )

  // Phones, map showing: tees and Start round, then the two plays (Smart / Go for it) with their penalty
  // shares, then the club chips with "All clubs" -- one dock at a fixed height above the tab bar, so the map
  // above it never changes size. Tablets and desktops keep these in the page. Scoring puts it back in the page.
  const dockClass = scoring
    ? "space-y-3"
    : "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[1100] flex h-[9.25rem] flex-col justify-between overflow-hidden rounded-t-2xl border border-b-0 border-fg/[0.1] bg-surface px-4 md:static md:z-auto md:block md:h-auto md:space-y-3 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:px-0"
  const rowClass = scoring ? "space-y-3" : "flex h-11 shrink-0 items-center justify-between gap-2 md:h-auto md:flex-wrap md:justify-start md:gap-3"

  return (
    <div className="space-y-3 pb-40 md:pb-0">
      {introOpen && <IntroCards onClose={closeIntro} />}
      {/* ---- header: "H7 · P3 · 108" and the course name; opens the course/hole sheet ---- */}
      <HoleHeader
        title={holeTitle}
        courseName={headerCourseName}
        onOpenPicker={() => setPickerOpen(true)}
        showArrows={holes.length > 1}
        onStep={stepHole}
        holeLabel={holeLabel}
      />

      {course && loadState !== "error" && (
        <div className={dockClass}>
          <div className={rowClass}>
            {!roundHere && (
              <TeeLine
                courseId={course.id}
                courseName={course.name}
                driverCarryYds={roundSource}
                handicapIndex={source === "handicap" ? handicap : trackedHandicap}
                compact={phone && !scoring}
              />
            )}
            {hydrated && (
              <PlayRound
                course={course}
                courseHoles={holes}
                currentHole={hole?.ref ?? null}
                round={round}
                onRoundChange={changeRound}
                view={playView}
                onViewChange={changePlayView}
                onGoToHole={goToHoleNumber}
                onResume={(c, n) => void loadCourse(c, { autoHoleRef: n })}
                driverCarryYds={roundSource}
                handicapIndex={source === "handicap" ? handicap : trackedHandicap}
                signedIn={!!authUser}
                userId={authUser?.id ?? null}
                offlineReport={offlineReport}
                savedNote={savedNote}
                onSavedNote={setSavedNote}
                obAnswered={(n) => {
                  const h = holes.find((x) => x.ref === n)
                  return !!h && (obTags.obTagMap[h.id]?.length ?? 0) > 0
                }}
                onObAnswer={(n, side) => {
                  const h = holes.find((x) => x.ref === n)
                  if (h) void obTags.toggleTag(h.id, side)
                }}
              />
            )}
          </div>
          {!scoring && (
            <>
              <div className="h-14 shrink-0 md:hidden">
                {optionsNote && chosen && <StrategyToggle options={optionsNote} chosen={chosen} onPick={pickClub} compact />}
              </div>
              <div className="flex h-11 shrink-0 items-center gap-2 md:hidden">
                <ClubChips ranking={ranking} chosen={chosen} onPick={pickClub} className="flex min-w-0 flex-1 gap-1.5" />
                {planReady && ranking.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-fg/[0.12] px-3 text-sm text-fg-2"
                  >
                    All clubs <ChevronUp size={14} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Scoring a hole hides the map (kept mounted, so it comes back as it was). */}
      <div className={scoring ? "hidden" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]"}>
        {/* ---- map ---- (min-w-0 stops a wide child from stretching the page on phones) */}
        <MapView
          placing={placing}
          onPlacingChange={setPlacing}
          drawKind={drawKind}
          pendingPoints={pendingPoints}
          aimIsManual={!!aimManual}
          onResetAim={() => {
            setAimManual(null)
          }}
          layersRef={layersMenuRef}
          layersActive={showLayersMenu || showTrouble || following || !!drawKind}
          onLayersClick={() => {
            if (!showLayersMenu && layersMenuRef.current) {
              const r = layersMenuRef.current.getBoundingClientRect()
              setLayersMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 224) })
            }
            setShowLayersMenu((v) => !v)
          }}
          layersMenu={layersMenu}
          gpsError={gpsError}
          gpsNote={gpsNote}
          notices={notices}
          onUndoDraw={undoDrawPoint}
          onFinishDraw={finishDraw}
          onCancelDraw={cancelDraw}
          mapWrapRef={mapWrapRef}
          mapContent={mapContent}
          planReady={planReady}
          showTrouble={showTrouble}
          zones={zones}
          localOnlyZones={localOnlyZones}
          showMarks={showMarks}
          onToggleMarks={() => setShowMarks((v) => !v)}
          onSyncZones={syncLocalZonesToAccount}
          syncingZones={syncingZones}
          onDismissLocalZones={() => setLocalOnlyZones(null)}
          signedIn={!!authUser}
          onDeleteZone={deleteZone}
        />
        {/* ---- shot plan (tablet/desktop: everything inline, including the table) ---- */}
        <aside className="hidden min-w-0 space-y-3 md:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {placePrompt}
          {planCard}
          {planReady && ranking.length > 0 && clubTable}
          {planReady && scoringDetails}
        </aside>

        {/* ---- shot plan (phone: table moves into a bottom sheet so the map stays dominant) ---- */}
        <div className="min-w-0 space-y-3 md:hidden">
          {placePrompt}
          {planCard}
          {planReady && scoringDetails}
        </div>
      </div>

      {/* Phones: "All clubs" opens the full club table as a full-screen list (it covers the map, so every
          club fits without a scroll fighting the map). Picking a club closes it. */}
      {planReady && ranking.length > 0 && !scoring && (
        <ClubSheet open={sheetOpen} onToggle={() => setSheetOpen((v) => !v)} chosen={chosen}>
          {clubTable}
        </ClubSheet>
      )}

      {pickerSheet}

      {editingHole && hole && course?.lat != null && course.lng != null && (
        <EditHoleModal
          hole={hole}
          defaultYardageYds={distanceYds(hole.line[0], hole.line[hole.line.length - 1])}
          courseCenter={{ lat: course.lat, lng: course.lng }}
          signedIn={!!authUser}
          submitting={correctionSubmitting}
          onClose={() => setEditingHole(false)}
          onSubmit={submitHoleCorrection}
          obTags={holeObTags}
          onToggleOb={(side) => holeId && void obTags.toggleTag(holeId, side)}
          onObMargin={(m) => holeId && void obTags.setMargin(holeId, m)}
        />
      )}
      {correctionNote && (
        <div className="fixed bottom-20 left-1/2 z-[1400] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-accent/30 bg-surface px-4 py-3 text-center text-sm text-fg shadow-2xl md:bottom-6">
          {correctionNote}
        </div>
      )}
    </div>
  )
}
