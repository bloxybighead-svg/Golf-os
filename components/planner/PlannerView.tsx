"use client"

// Draws the Play planner page from usePlannerController's state: title line,
// notices, Play round, map column, result card and club table, phone sheet,
// course picker and the hole-correction dialog. Moved verbatim from
// CourseMapClient.tsx.

import type { PlannerProps as Props } from "@/lib/planner/types"
import type { PlannerVM } from "@/hooks/usePlannerController"
import Link from "next/link"
import { MAP_TAP_GUARD_MS } from "@/lib/planner/clubChoice"
import { Loader2, X } from "lucide-react"
import dynamic from "next/dynamic"
import { distanceYds } from "@/lib/course/geo"
import { ONBOARDED_KEY } from "@/lib/golfer/baseline"
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
import { CoursePickerSheet } from "@/components/planner/CoursePickerSheet"
import { MapView } from "@/components/planner/MapView"

const CourseMap = dynamic(() => import("@/components/simulator/CourseMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-muted">Loading map…</div>,
})

export function PlannerView({ vm, calibrated, calibratedName, trackedHandicap }: { vm: PlannerVM } & Omit<Props, "baseline">) {
  const {
    mapTapGuardUntil,
    loadNeedsSignIn, searchError,
    addDrawPoint, aim, aimAtBest, aimIsPin, aimManual, aimToPin, atBestAim, authUser, avgLeft, bag,
    bagDriverCarry, ball, baselineHandicap, best, cancelDraw, changePlayView, changeRound, chipParts,
    chooseCourse, chosen, chosenAtAim, chosenLive, clubChoice, correctionNote, correctionSubmitting, course,
    deleteZone, distAim, distPin, drawKind, driverCarry, editingHole, estimatedFrom, extraCarries, finishDraw,
    fit, following, fromLabel, geometry, goToHoleNumber, gpsAccuracyYds, gpsError, gpsNote, handicap,
    hasCourseProblems, hits, hole, holeBearingDeg, holeId, holeLabel, holeQuality, holes, hydrated,
    initialZoom, labels, landings, layersMenuPos, layersMenuRef, loadCourse, loadError, loadState,
    localOnlyZones, longestCarry, mapWrapRef, moveBallTo, pendingPoints, pickClub, pickHole, pickerOpen, pin,
    placing, planReady, playView, query, rankState, ranking, rankingPending, recent, refreshCourseData,
    refreshing, rings, round, roundHere, scoreBaseline, scoring, searched, searching, setAimManual,
    setClubChoice, setDriverCarry, setEditingHole, setHandicap, setHazardConfirmed, setLayersMenuPos,
    setLocalOnlyZones, setPickerOpen, setPinManual, setPlacing, setQuery, setSevenIronCarry, setSheetOpen,
    setShowCarry, setShowLayersMenu, setShowMarks, setShowRings, setShowSetupPrompt, setShowTrouble,
    setShowZones, setSource, setTendency, sevenIronCarry, sheetOpen, showCarry, showLayersMenu, showMarks,
    showRings, showSetupPrompt, showTrouble, showZones, shownLies, source, startDraw, stats, stepHole,
    stopFollowing, submitHoleCorrection, syncLocalZonesToAccount, syncingZones, tendency, toggleClub,
    toggleFollow, troubleCells, undoDrawPoint, useMyLocation, zones,
  } = vm

  const planCard =
    best && chosen && chosenLive ? (
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
        estimatedFrom={estimatedFrom}
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
      />
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
      estimatedFrom={estimatedFrom}
      baselineLabel={scoreBaseline.label}
      onPick={(r) => {
        mapTapGuardUntil.current = Date.now() + MAP_TAP_GUARD_MS // the closing tap must not reach the map
        pickClub(r)
        setSheetOpen(false)
      }}
    />
  )

  const scoringDetails = <ScoringDetails baselineHandicap={baselineHandicap} />

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
      estimatedFrom={estimatedFrom}
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
        drawKind={drawKind}
        pendingPoints={pendingPoints}
        labels={labels}
        placing={placing}
        fitBounds={fit.bounds}
        fitKey={fit.key}
        initialZoom={initialZoom}
        onZoomChange={(z) => course && saveZoom(course.id, z)}
        holeBearingDeg={holeBearingDeg}
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

  return (
    <div className="space-y-3">
      {showSetupPrompt && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-fg/[0.08] bg-surface py-1 pl-3 pr-1 text-sm">
          <span className="text-fg-2">Plan with your own clubs.</span>
          <span className="flex shrink-0 items-center">
            <Link href="/welcome" className="flex h-11 items-center px-3 font-semibold text-accent hover:underline">
              Set up
            </Link>
            <button
              onClick={() => {
                setShowSetupPrompt(false)
                try {
                  localStorage.setItem(ONBOARDED_KEY, "dismissed")
                } catch {
                  /* it just comes back next visit */
                }
              }}
              aria-label="Dismiss"
              className="flex h-11 w-11 items-center justify-center text-muted hover:text-fg"
            >
              <X size={16} />
            </button>
          </span>
        </div>
      )}

      {/* ---- title: one tappable line that opens the course/hole sheet, plus previous/next hole ---- */}
      <HoleHeader
        title={chipParts.join(" · ")}
        onOpenPicker={() => setPickerOpen(true)}
        showArrows={holes.length > 1}
        onStep={stepHole}
        holeLabel={holeLabel}
      />

      {loadState === "loading" && course && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> {loadError || "Loading course…"}
        </p>
      )}
      {loadState === "error" && course && (
        <p className="text-xs text-danger">
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
      {loadState === "idle" && loadError && <p className="text-xs text-muted">{loadError}</p>}

      {course && loadState !== "error" && !roundHere && (
        <TeeLine
          courseId={course.id}
          courseName={course.name}
          driverCarryYds={bagDriverCarry ?? (longestCarry > 0 ? longestCarry : null)}
          handicapIndex={source === "handicap" ? handicap : trackedHandicap}
        />
      )}

      {course && loadState !== "error" && hydrated && (
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
          driverCarryYds={bagDriverCarry ?? (longestCarry > 0 ? longestCarry : null)}
          handicapIndex={source === "handicap" ? handicap : trackedHandicap}
          signedIn={!!authUser}
        />
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

      {/* Phones: the club table. Collapsed, a chip above the tab bar; open, a
          full-screen list (it covers the map, so every club fits without a
          scroll fighting the map). Picking a club closes it. */}
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
