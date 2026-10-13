"use client"

// Draws the Play planner page from usePlannerController's state: title line,
// notices, Play round, map column, result card and club table, phone sheet,
// course picker and the hole-correction dialog. Moved verbatim from
// CourseMapClient.tsx.

import { useState } from "react"
import type { PlannerProps as Props } from "@/lib/planner/types"
import { FirstRun } from "@/components/welcome/FirstRun"
import type { PlannerVM } from "@/hooks/usePlannerController"
import Link from "next/link"
import { MAP_TAP_GUARD_MS } from "@/lib/planner/clubChoice"
import { Loader2 } from "lucide-react"
import dynamic from "next/dynamic"
import { distanceYds } from "@/lib/course/geo"
import { useIsPhone } from "@/hooks/useIsPhone"
import { useIsCompact } from "@/hooks/useIsCompact"
import { useRoundMode } from "@/hooks/useRoundMode"
import { setRoundPaused } from "@/lib/rounds/roundMode"
import { holeToScore, scoreToParLabel } from "@/lib/rounds/activeRound"
import { RoundDock } from "@/components/play/RoundDock"
import { RoundScreen } from "@/components/play/RoundScreen"
import { ShotSheet } from "@/components/play/ShotSheet"
import { StrategyToggle } from "@/components/planner/StrategyToggle"
import { PlayDock } from "@/components/planner/PlayDock"
import { dockCssVars } from "@/lib/planner/dock"
import { EditHoleModal } from "@/components/simulator/EditHoleModal"
import { TeeLine } from "@/components/simulator/TeeLine"
import { PlayRound } from "@/components/play/PlayRound"
import { LastShotLine } from "@/components/play/LastShotLine"
import { saveZoom } from "@/lib/planner/storage"
import { DetailsPanel, type DetailsSection } from "@/components/planner/DetailsPanel"
import { ClubTable } from "@/components/planner/ClubTable"
import { ResultCard } from "@/components/planner/ResultCard"
import { isLowConfidence } from "@/lib/course/plan"
import { LayersMenu } from "@/components/planner/LayersMenu"
import { HoleHeader, type HoleMenuItem } from "@/components/planner/HoleHeader"
import { ClubSheet } from "@/components/planner/ClubSheet"
import { ClubChips } from "@/components/planner/ClubChips"
import { ObBanner } from "@/components/planner/ObBanner"
import { CoursePickerSheet } from "@/components/planner/CoursePickerSheet"
import { MARKS_USER_ID } from "@/lib/planner/marks"
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
    addDrawPoint, aim, aimAtBest, aimState, atBestAim, authUser, avgLeft, bag,
    bagDriverCarry, ball, baselineHandicap, best, cancelDraw, changeRound, holeTitle, headerCourseName,
    chooseCourse, chosen, chosenAtAim, chosenLive, clubChoice, correctionNote, correctionSubmitting, course,
    deleteZone, distPin, drawKind, driverCarry, editingHole, estimateNotes, extraCarries, finishDraw,
    fit, following, fromLabel, geometry, goToHoleNumber, gpsAccuracyYds, gpsError, gpsNote, handicap,
    hasCourseProblems, hits, hole, holeBearingDeg, holeId, holeLabel, holeQuality, holes, hydrated,
    initialZoom, labels, landings, layersMenuPos, layersMenuRef, loadCourse, loadError, loadState,
    mapWrapRef, moveBallTo, pendingPoints, pickClub, pickHole, pickerOpen, pin,
    placing, planReady, query, rankState, ranking, rankingPending, recent, refreshCourseData,
    refreshing, ellipse, round, roundHere, scoreBaseline, searched, searching, dispatchAim,
    setClubChoice, setDriverCarry, setEditingHole, setHandicap, setHazardConfirmed, setLayersMenuPos,
    optionsNote, strategyMode, obBands, obTags, holeObTags, noObMapped,
    setPickerOpen, setPinManual, setPlacing, setQuery, setSevenIronCarry, setSheetOpen,
    setShowCarry, setShowLayersMenu, setShowMarks, setShowEllipse, setShowTrouble,
    setShowZones, setSource, setTendency, sevenIronCarry, sheetOpen, showCarry, showLayersMenu, showMarks,
    showEllipse, showTrouble, showZones, shownLies, source, startDraw, stats, stepHole,
    stopFollowing, submitHoleCorrection, tendency, toggleClub,
    toggleFollow, troubleCells, undoDrawPoint, useMyLocation, zones,
    pinPlaysLike, greenYards, greenLabel, coldTip, wind, playsLikeOn, setPlaysLikeOn, hasElevation, aimLie,
    roundSheet, setRoundSheet, holeOffer, answerHoleOffer, lastShot, editShot,
  } = vm

  const isOwner = authUser?.id === MARKS_USER_ID

  // Round mode on a phone: the round screen replaces the page (hooks/useRoundMode.ts).
  const { on: roundMode } = useRoundMode()
  const compact = useIsCompact()
  const roundScreen = roundMode && compact && hydrated && !!roundHere
  const [shotOpen, setShotOpen] = useState(false)

  const [details, setDetails] = useState<{ open: boolean; section: DetailsSection }>({ open: false, section: "scoring" })
  const openDetails = (section: DetailsSection) => {
    setShotOpen(false)
    setDetails({ open: true, section })
  }

  const resultCard =
    best && chosen && chosenLive ? (
      <ResultCard
        best={best}
        chosen={chosen}
        clubChoice={clubChoice}
        atBestAim={atBestAim}
        chosenAtAim={chosenAtAim}
        aimLie={aimLie}
        distPin={distPin}
        greenYards={greenYards}
        options={optionsNote}
        pinPlaysLike={pinPlaysLike}
        onAimAtBest={aimAtBest}
        onBackToBest={() => {
          setClubChoice("auto")
        }}
        onOpenDetails={openDetails}
      />
    ) : null

  const detailsPanel =
    best && chosen && chosenLive ? (
      <DetailsPanel
        open={details.open}
        section={details.section}
        onClose={() => setDetails((d) => ({ ...d, open: false }))}
        wind={wind}
        holeBearingDeg={holeBearingDeg}
        playsLikeOn={playsLikeOn}
        onPlaysLikeChange={setPlaysLikeOn}
        hasElevation={hasElevation}
        breakdown={pinPlaysLike?.breakdown ?? null}
        coldTip={coldTip}
        hole={hole}
        holeQuality={holeQuality}
        geometry={geometry}
        onEditHole={() => setEditingHole(true)}
        onStartDraw={startDraw}
        onConfirmHazard={setHazardConfirmed}
        best={best}
        chosen={chosen}
        chosenLive={chosenLive}
        options={optionsNote}
        atBestAim={atBestAim}
        chosenAtAim={chosenAtAim}
        fromLabel={fromLabel}
        baselineHandicap={baselineHandicap}
        shotsLabel={source === "calibrated" ? "My shots" : source === "legacy" ? `${calibratedName} (old data)` : "Handicap estimate"}
        avgLeft={avgLeft}
        estimateNotes={estimateNotes}
        onCourseSpread={vm.onCourseSpread}
              sheet={roundScreen}
      />
    ) : null

  const planCard =
    best && chosen && chosenLive ? (
      <>
      {noObMapped && holeId && <ObBanner onAnswer={(a) => void obTags.answer(holeId, a)} />}
      {optionsNote && <StrategyToggle options={optionsNote} chosen={chosen} onPick={pickClub} className="hidden md:grid" />}
      <ClubChips ranking={ranking} chosen={chosen} onPick={pickClub} onMore={() => setSheetOpen(true)} className="hidden md:flex gap-1.5" />
      {resultCard}
      {detailsPanel}
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
      smartMode={strategyMode === "smart"}
      onPick={(r) => {
        mapTapGuardUntil.current = Date.now() + MAP_TAP_GUARD_MS // the closing tap must not reach the map
        pickClub(r)
        setSheetOpen(false)
      }}
    />
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
      showEllipse={showEllipse}
      onToggleEllipse={() => setShowEllipse((v) => !v)}
      showCarry={showCarry}
      onToggleCarry={() => setShowCarry((v) => !v)}
      hasZones={isOwner && zones.length > 0}
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
        ellipse={ellipse}
        zones={showZones ? zones : []}
        obEdges={obBands.map((b) => b.edge)}
        drawKind={drawKind}
        pendingPoints={pendingPoints}
        labels={labels}
        greenLabel={greenLabel}
        placing={placing}
        fit={fit}
        fitKey={fit.key}
        initialZoom={initialZoom}
        onZoomChange={(z) => course && saveZoom(course.id, z)}
        holeBearingDeg={holeBearingDeg}
        wind={playsLikeOn ? wind.wind : null}
        onWindClick={() => openDetails("conditions")}
        onBall={(p) => {
          if (Date.now() < mapTapGuardUntil.current) return
          stopFollowing()
          moveBallTo(p)
          if (!pin) setPlacing("pin") // no hole to take a pin from: the next tap places it
        }}
        onAim={(p) => {
          if (Date.now() < mapTapGuardUntil.current) return
          dispatchAim({ type: "drag", point: p })
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

  // Messages that sit over the top-left of the map, so they never push it down or around.
  const notices = (
    <>
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
      {lastShot && <LastShotLine shot={lastShot} clubs={bag} onEdit={editShot} />}
    </>
  )

  const holeMenu: HoleMenuItem[] | undefined = roundHere
    ? [
        { label: roundHere.holes.some((h) => h.strokes != null) ? `Scorecard · ${scoreToParLabel(roundHere)}` : "Scorecard", onSelect: () => setRoundSheet({ kind: "card" }) },
        ...(hole ? [{ label: "Edit hole", onSelect: () => setEditingHole(true) }] : []),
        ...(compact ? [{ label: "Pause round", onSelect: () => setRoundPaused(true) }] : []),
        {
          label: "End round",
          danger: true,
          onSelect: () => setRoundSheet({ kind: "finish", ending: true }),
        },
      ]
    : undefined

  const holeHeader = (inRoundScreen: boolean) => (
    <HoleHeader
      title={holeTitle}
      courseName={headerCourseName}
      onOpenPicker={() => setPickerOpen(true)}
      showArrows={holes.length > 1}
      onStep={stepHole}
      holeLabel={holeLabel}
      menu={holeMenu}
      inRoundScreen={inRoundScreen}
    />
  )

  const mapView = (fill: boolean) => (
    <MapView
      placing={placing}
      onPlacingChange={setPlacing}
      drawKind={drawKind}
      pendingPoints={pendingPoints}
      aimIsManual={aimState.mode === "manual"}
      onResetAim={aimAtBest}
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
      zones={isOwner ? zones : []}
      showMarks={showMarks}
      onToggleMarks={() => setShowMarks((v) => !v)}
      onDeleteZone={deleteZone}
      fill={fill}
    />
  )

  const playRound = (embedded: boolean) =>
    hydrated &&
    course && (
      <PlayRound
        course={course}
        courseHoles={holes}
        currentHole={hole?.ref ?? null}
        round={round}
        onRoundChange={changeRound}
        sheet={roundSheet}
        onSheetChange={setRoundSheet}
        onGoToHole={goToHoleNumber}
        onResume={(c, n) => void loadCourse(c, { autoHoleRef: n })}
        driverCarryYds={bagDriverCarry}
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
        holeOffer={holeOffer}
        onHoleOffer={answerHoleOffer}
        embedded={embedded}
      />
    )

  const clubChips = (all: boolean) => (
    <ClubChips ranking={ranking} chosen={chosen} onPick={pickClub} onMore={() => setSheetOpen(true)} all={all} className="flex min-w-0 flex-1 gap-1.5" />
  )

  const overlays = (
    <>
      {/* Phones: "All clubs" opens the full club table as a full-screen list (it covers the map, so every
          club fits without a scroll fighting the map). Picking a club closes it. */}
      {planReady && ranking.length > 0 && (
        <ClubSheet open={sheetOpen} onToggle={() => setSheetOpen((v) => !v)} chosen={chosen}>
          {clubTable}
        </ClubSheet>
      )}

      {pickerSheet}

      {editingHole && hole && course?.lat != null && course.lng != null && (
        <EditHoleModal
          hole={hole}
          defaultYardageYds={distanceYds(hole.line[0], hole.line[hole.line.length - 1])}
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
        <div
          className={`fixed z-[1400] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-accent/30 bg-surface px-4 py-3 text-center text-sm text-fg shadow-2xl left-1/2 ${
            roundScreen ? "top-[calc(52px+env(safe-area-inset-top)+0.75rem)]" : "bottom-20 md:bottom-6"
          }`}
        >
          {correctionNote}
        </div>
      )}
    </>
  )

  if (roundScreen) {
    return (
      <>
        <RoundScreen
          header={holeHeader(true)}
          map={mapView(true)}
          dock={
            <RoundDock
              plays={
                optionsNote && chosen ? (
                  <StrategyToggle options={optionsNote} chosen={chosen} onPick={pickClub} compact className="landscape:grid-cols-1" unmappedWarning={isLowConfidence(chosen.plan) ? chosen.plan.unmappedShare : null} onUnmapped={() => openDetails("map")} />
                ) : (
                  placePrompt
                )
              }
              chips={clubChips(true)}
              onDetails={resultCard ? () => setShotOpen(true) : null}
              onHoleDone={() => setRoundSheet({ kind: "hole", hole: holeToScore(roundHere, hole?.ref ?? null), advance: true })}
            />
          }
          round={playRound(true)}
        />
        <ShotSheet open={shotOpen} onClose={() => setShotOpen(false)}>
          {resultCard}
        </ShotSheet>
        {detailsPanel}
        {overlays}
      </>
    )
  }

  return (
    <div className="space-y-3 pb-[calc(var(--dock-h)+1rem)] md:pb-0" style={dockCssVars}>
      {vm.firstRun && <FirstRun onDone={vm.finishFirstRun} onDemo={vm.startDemo} />}
      {/* ---- header: "H7 · P3 · 108" and the course name; opens the course/hole sheet ---- */}
      {holeHeader(false)}

      {course && loadState !== "error" && (
        <PlayDock
          status={
            <>
              {!roundHere && (
                <TeeLine
                  courseId={course.id}
                  courseName={course.name}
                  driverCarryYds={bagDriverCarry}
                  handicapIndex={source === "handicap" ? handicap : trackedHandicap}
                  compact={phone}
                />
              )}
              {playRound(false)}
            </>
          }
          plays={
            optionsNote && chosen && (
              <StrategyToggle options={optionsNote} chosen={chosen} onPick={pickClub} compact unmappedWarning={isLowConfidence(chosen.plan) ? chosen.plan.unmappedShare : null} onUnmapped={() => openDetails("map")} />
            )
          }
          chips={clubChips(false)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]">
        {/* ---- map ---- (min-w-0 stops a wide child from stretching the page on phones) */}
        {mapView(false)}
        {/* ---- shot plan (tablet/desktop: everything inline, including the table) ---- */}
        <aside className="hidden min-w-0 space-y-3 md:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {placePrompt}
          {planCard}
        </aside>

        {/* ---- shot plan (phone: table moves into a bottom sheet so the map stays dominant) ---- */}
        <div className="min-w-0 space-y-3 md:hidden">
          {placePrompt}
          {planCard}
        </div>
      </div>

      {overlays}
    </div>
  )
}
