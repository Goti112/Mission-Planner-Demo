/**
 * MissionReplayViewer.tsx
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FULL-SCREEN MISSION REPLAY VIEW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Replaces the previous ReplayPanel bottom bar with a dedicated view.
 * Features:
 *   - Full-screen Mapbox map with recorded trajectory rendered as
 *     colored polyline.
 *   - Animated drone marker following the replay.
 *   - Floating mini-panel with Play/Pause, speed, timeline.
 *   - Contextual telemetry readout (alt, speed, time).
 *   - Back button to return to FLIGHT view.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react'
import Map, { Source, Layer, Marker } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import {
  useFlightRecorderStore,
  MAX_FRAMES_PER_DRONE,
  RECORD_HZ,
} from '../store/flightRecorderStore'
import {
  useReplayTrajectoryStore,
  trailWindowStart,
  TRAIL_WINDOW_M,
} from '../store/replayTrajectoryStore'
import { useDroneStore } from '../../drone'
import { useUIStore } from '../../../shared/store/uiStore'
import { AircraftIcon, LazyCesiumGlobe, MapZoomControl } from '../../map'
import { CoordinateDisplay } from '../../../components/shared/CoordinateDisplay'
import './MissionReplayViewer.css'

import ReplayAnalysisPanel from './ReplayAnalysisPanel'
import ReplayPlotPanel from './ReplayPlotPanel'
import ReplayExportMenu from './ReplayExportMenu'
import { useMissionReplayController, seekToFrame } from './useMissionReplayController'

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8] as const
const MS_TO_KMH = 3.6

// ── Component ──────────────────────────────────────────────────────────────

const MissionReplayViewer: React.FC = () => {
  const mapRef = useRef<MapRef>(null)

  // Store bindings
  const recordings    = useFlightRecorderStore(s => s.recordings)
  const replayState   = useFlightRecorderStore(s => s.replayState)
  const replayIndex   = useFlightRecorderStore(s => s.replayIndex)
  const replaySpeed   = useFlightRecorderStore(s => s.replaySpeed)
  const replayDroneId = useFlightRecorderStore(s => s.replayDroneId)

  const setReplayIndex  = useFlightRecorderStore(s => s.setReplayIndex)
  const injectMock      = useFlightRecorderStore(s => s.injectMockRecording)

  const mapStyle       = useUIStore(s => s.mapStyle)
  const setMapStyle    = useUIStore(s => s.setMapStyle)

  const dronesObj = useDroneStore(s => s.drones)

  // ── Global trajectory store — single source of truth for all renderers ──
  // allPoints:    full recording, built once.  Stable across view switches.
  // visibleCount: updated at 20 Hz by replay engine and on manual scrub.
  // Both 2D and 3D renderers read from here → switching views is lossless.
  const allPoints    = useReplayTrajectoryStore(s => s.allPoints)
  const visibleCount = useReplayTrajectoryStore(s => s.visibleCount)
  const trajBounds   = useReplayTrajectoryStore(s => s.bounds)
  const buildTraj    = useReplayTrajectoryStore(s => s.buildFromRecording)
  const syncToFrame  = useReplayTrajectoryStore(s => s.syncToFrame)

  // Local state
  const [mapLoaded, setMapLoaded] = useState(false)
  const [fittedBounds, setFittedBounds] = useState(false)
  /** Toggle between 2D Mapbox map and 3D Cesium globe */
  const [view3D, setView3D] = useState(false)
  /** Show photorealistic 3D buildings in Cesium (only effective in satellite style) */
  const [show3DBuildings, setShow3DBuildings] = useState(true)

  const {
    recordedIds,
    effectiveDroneId,
    maxFrames,
    hasData,
    isPlaying,
    isReplaying,
    currentDrone,
    currentTime,
    totalDuration,
    missionTimeMM,
    missionTimeSS,
    scrubPercent,
    progressPercent,
    headingDeg,
    headingLabel,
    stateLabel,
    stateDot,
    missionName,
    styleUrl,
    replayTrackHeading,
    handleBack,
    handlePlayPause,
    handleStop,
    handleReset,
    handleScrubStart,
    handleScrub,
    handleSpeedChange,
  } = useMissionReplayController({
    recordings,
    replayState,
    replayIndex,
    replaySpeed,
    replayDroneId,
    dronesObj,
    mapStyle,
    allPoints,
    visibleCount,
  })

  const replayIndexRef = useRef(replayIndex)
  const playStartDiagnosticRef = useRef({
    effectiveDroneId,
    maxFrames,
    recordings,
    replayIndex,
  })
  const previousReplayStateRef = useRef(replayState)

  useEffect(() => {
    replayIndexRef.current = replayIndex
    playStartDiagnosticRef.current = {
      effectiveDroneId,
      maxFrames,
      recordings,
      replayIndex,
    }
  }, [effectiveDroneId, maxFrames, recordings, replayIndex])

  // ── Build global trajectory when the active recording changes ────────────
  // allPoints is populated ONCE from the ring-buffer and stored globally.
  // Both 2D (Mapbox) and 3D (Cesium) renderers consume from this store,
  // so switching views NEVER resets the trajectory.
  useEffect(() => {
    const rec = effectiveDroneId ? recordings[effectiveDroneId] : null
    if (effectiveDroneId && rec && rec.total >= 2) {
      buildTraj(effectiveDroneId, rec)
      // Sync visible portion to current replay position immediately so that
      // any renderer mounting after this sees the correct "played-through" path.
      syncToFrame(Math.floor(replayIndexRef.current))
      if (import.meta.env.DEV) {
        const frameCount = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
        const duration = frameCount / RECORD_HZ
        console.group('🎬 [ReplayViewer] trajectory loaded')
        console.log('  drone:', effectiveDroneId)
        console.log('  frames:', frameCount)
        console.log('  duration:', duration.toFixed(1) + 's')
        console.log('  current frame:', Math.floor(replayIndexRef.current))
        console.log('  STATUS:', '✅ READY for 2D & 3D')
        console.groupEnd()
      }
    } else {
      useReplayTrajectoryStore.getState().clear()
    }
  }, [recordings, effectiveDroneId, buildTraj, syncToFrame])

  // ── Trajectory GeoJSON for Mapbox 2D ────────────────────────────────────
  // fullGeoJSON: dim static overlay of the ENTIRE flight path (rebuilds only
  //              when the recording changes — stable reference).
  // traveledGeoJSON: the "played-through" portion — sliced cheaply from
  //              allPoints using visibleCount (no ring-buffer rescan).
  const fullGeoJSON = useMemo(() => {
    if (allPoints.length < 2) return null
    return {
      type: 'FeatureCollection' as const,
      features: [{
        type:       'Feature'    as const,
        properties: {},
        geometry: {
          type:        'LineString' as const,
          coordinates: allPoints.map(p => [p.lng, p.lat]),
        },
      }],
    }
  }, [allPoints])

  const traveledGeoJSON = useMemo(() => {
    if (allPoints.length < 2 || visibleCount < 2) return null
    const endIdx   = visibleCount - 1
    const startIdx = trailWindowStart(allPoints, endIdx, TRAIL_WINDOW_M)
    return {
      type: 'FeatureCollection' as const,
      features: [{
        type:       'Feature'    as const,
        properties: {},
        geometry: {
          type:        'LineString' as const,
          coordinates: allPoints.slice(startIdx, visibleCount).map(p => [p.lng, p.lat]),
        },
      }],
    }
  }, [allPoints, visibleCount])

  // Fit map to trajectory bounds on first load
  useEffect(() => {
    if (mapLoaded && trajBounds && !fittedBounds && mapRef.current) {
      const pad = 0.002
      mapRef.current.fitBounds(
        [[trajBounds[0] - pad, trajBounds[1] - pad], [trajBounds[2] + pad, trajBounds[3] + pad]],
        { padding: 80, duration: 800 },
      )
      setFittedBounds(true)
    }
  }, [mapLoaded, trajBounds, fittedBounds])

  // Seek to frame 0 when entering the view (so telemetry panel shows real data)
  // Also mark the drone as active so the 3D camera follows it.
  useEffect(() => {
    if (hasData && replayState === 'IDLE') {
      seekToFrame(0, effectiveDroneId, recordings, recordedIds)
      setReplayIndex(0)
      syncToFrame(0)
    }
    if (effectiveDroneId) {
      useDroneStore.getState().setActiveDrone(effectiveDroneId)
    }
  }, [effectiveDroneId, hasData, recordedIds, recordings, replayState, setReplayIndex, syncToFrame])

  // Diagnostic: on every play-start, log frame data so the user can verify
  // the recording is valid and the replay engine has real data to work with.
  useEffect(() => {
    const previousReplayState = previousReplayStateRef.current
    previousReplayStateRef.current = replayState
    if (replayState !== 'PLAYING' || previousReplayState === 'PLAYING') return
    const {
      effectiveDroneId: diagnosticDroneId,
      maxFrames: diagnosticMaxFrames,
      recordings: diagnosticRecordings,
      replayIndex: diagnosticReplayIndex,
    } = playStartDiagnosticRef.current
    const rec = diagnosticDroneId ? diagnosticRecordings[diagnosticDroneId] : null
    const frames = rec ? Math.min(rec.total, MAX_FRAMES_PER_DRONE) : 0
    console.debug(
      '[ReplayViewer] PLAY  drone=%s  frames=%d  duration=%.1fs  maxFrames=%d  index=%.0f',
      diagnosticDroneId, frames, frames / RECORD_HZ, diagnosticMaxFrames, diagnosticReplayIndex,
    )
  }, [replayState])

  // Handlers extracted to useMissionReplayController

  // ── Render ───────────────────────────────────────────────────────────

  if (!hasData) {
    const firstDroneId = Object.keys(dronesObj)[0] ?? 'drone-1'
    const firstDrone   = dronesObj[firstDroneId]
    return (
      <div className="mrv" role="region" aria-label="Mission replay">
        <div className="mrv__empty">
          <span className="mrv__empty-icon">📭</span>
          <h2>Sin datos de vuelo</h2>
          <p>No hay grabaciones para reproducir. Vuela una misión o genera datos de prueba.</p>
          <div className="mrv__empty-actions">
            <button className="mrv__back-btn" onClick={handleBack}>
              ← Volver a vuelo
            </button>
            <button
              className="mrv__back-btn"
              onClick={() => injectMock(
                firstDroneId,
                firstDrone?.lat ?? 40.4168,
                firstDrone?.lng ?? -3.7038,
              )}
              title="Crea 300 frames de vuelo circular de prueba para verificar el motor de replay"
            >
              ▶ Datos de prueba
            </button>
          </div>
          <p style={{ fontSize: '0.77rem', opacity: 0.5, marginTop: '0.5rem' }}>
            Drone: {firstDroneId} — {Object.keys(dronesObj).length} disponible(s)
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mrv" role="region" aria-label="Mission replay">
      {/* ── Full-screen viewer — 2D Mapbox map or 3D Cesium globe ── */}
      <div className="mrv__map">
        {view3D ? (
          /* 3D Cesium globe in replay mode. The viewerRole prop makes replay data flow explicit. */
          <LazyCesiumGlobe
            addingWaypoint={false}
            mapStyle={mapStyle}
            showBuildings={show3DBuildings}
            viewerRole="replay"
          />
        ) : (
          /* 2D Mapbox map with pre-recorded trajectory overlay */
          <Map
            ref={mapRef}
            mapLib={import('mapbox-gl')}
            initialViewState={{
              longitude: currentDrone?.lng ?? -3.7038,
              latitude:  currentDrone?.lat ?? 40.4168,
              zoom: 15,
            }}
            mapStyle={styleUrl}
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN || ''}
            onLoad={() => setMapLoaded(true)}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
          >
            {/* Full flight path — static dim overlay, only updates when recording changes */}
            {fullGeoJSON && (
              <Source id="replay-full" type="geojson" data={fullGeoJSON}>
                <Layer
                  id="replay-full-path"
                  type="line"
                  paint={{ 'line-color': '#4a90d9', 'line-width': 2, 'line-opacity': 0.25 }}
                />
              </Source>
            )}

            {/* Traveled portion — dynamic, updates on each replay frame */}
            {traveledGeoJSON && (
              <Source id="replay-traveled" type="geojson" data={traveledGeoJSON}>
                <Layer
                  id="replay-traveled-path"
                  type="line"
                  paint={{ 'line-color': '#40c8ff', 'line-width': 3, 'line-opacity': 0.9 }}
                />
              </Source>
            )}

            {/* Drone marker — identical AircraftIcon used in the normal flight view */}
            {currentDrone && (
              <Marker
                longitude={currentDrone.lng}
                latitude={currentDrone.lat}
                anchor="center"
              >
                <div className="mrv__drone-marker">
                  <AircraftIcon size={36} rotation={replayTrackHeading} active={true} />
                </div>
              </Marker>
            )}
          </Map>
        )}

        {/* ── Custom Zoom Control ── */}
        {!view3D && (
          <MapZoomControl
            zoom={mapRef.current?.getZoom() ?? 15}
            onZoomChange={(newZoom) => {
              mapRef.current?.easeTo({
                zoom: newZoom,
                duration: 150,
              });
            }}
          />
        )}
      </div>

      {/* ── Back button (top-left) ── */}
      <button className="mrv__back-overlay" onClick={handleBack} title="Volver a vuelo">
        <span>←</span> Vuelo
      </button>

      {/* ── Map/view style toolbar — identical to the main flight view ── */}
      <div className="gcs-map-toolbar">
        <button
          className={`gcs-map-tool-btn ${mapStyle === 'streets' && !view3D ? 'gcs-map-tool-btn--active' : ''}`}
          onClick={() => { setMapStyle('streets'); setView3D(false) }}
        >Mapa</button>
        <button
          className={`gcs-map-tool-btn ${mapStyle === 'dark' && !view3D ? 'gcs-map-tool-btn--active' : ''}`}
          onClick={() => { setMapStyle('dark'); setView3D(false) }}
        >Dark</button>
        <button
          className={`gcs-map-tool-btn ${mapStyle === 'satellite' && !view3D ? 'gcs-map-tool-btn--active' : ''}`}
          onClick={() => { setMapStyle('satellite'); setView3D(false) }}
        >Satélite</button>
        <button
          className={`gcs-map-tool-btn ${mapStyle === 'hybrid' && !view3D ? 'gcs-map-tool-btn--active' : ''}`}
          onClick={() => { setMapStyle('hybrid'); setView3D(false) }}
        >Híbrido</button>
        <div className="gcs-map-tool-divider" />
        <button
          className={`gcs-map-tool-btn ${view3D ? 'gcs-map-tool-btn--active' : ''}`}
          onClick={() => setView3D(v => !v)}
        >♦ 3D</button>
        {view3D && mapStyle === 'satellite' && (
          <button
            className={`gcs-map-tool-btn ${show3DBuildings ? 'gcs-map-tool-btn--active' : ''}`}
            onClick={() => setShow3DBuildings(v => !v)}
          >Edificios</button>
        )}
      </div>

      {/* ── Mission info badge (top-right) ── */}
      <div className="mrv__info-badge">
        <span className="mrv__info-mission">{missionName}</span>
        <span className={`mrv__state-dot ${stateDot}`} />
        <span className="mrv__state-label">{stateLabel}</span>
      </div>

      <div className="mrv__postflight-header">
        <ReplayExportMenu />
        <button
          className="mrv-export__button"
          type="button"
          onClick={() => {
            useFlightRecorderStore.getState().clearAll()
          }}
        >
          Limpiar
        </button>
      </div>

      {/* ── Telemetry panel (left overlay) — full professional readout ── */}
      <div className="mrv__telemetry">
        {/* Section: Estado */}
        <div className="mrv__tel-section-title">Estado</div>
        <div className="mrv__tel-row">
          <div className="mrv__tel-item">
            <span className="mrv__tel-label">TIEMPO MIS.</span>
            <span className="mrv__tel-value mrv__tel-value--mono">
              {missionTimeMM}:{missionTimeSS}
            </span>
          </div>
          <div className="mrv__tel-item">
            <span className="mrv__tel-label">PROGRESO</span>
            <span className="mrv__tel-value">{progressPercent}<small>%</small></span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mrv__tel-progress">
          <div className="mrv__tel-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        {/* Section: Posición */}
        <div className="mrv__tel-section-title">Posición</div>
        <div className="mrv__tel-item">
          <CoordinateDisplay
            latitude={currentDrone?.lat ?? 0}
            longitude={currentDrone?.lng ?? 0}
            rowClassName="mrv__tel-row"
            labelClassName="mrv__tel-label"
            valueClassName="mrv__tel-value mrv__tel-value--mono mrv__tel-value--sm"
          />
        </div>
        <div className="mrv__tel-item">
          <span className="mrv__tel-label">ALT (AGL)</span>
          <span className="mrv__tel-value">
            {(currentDrone?.altitude ?? 0).toFixed(1)}<small>m</small>
          </span>
        </div>

        {/* Section: Movimiento */}
        <div className="mrv__tel-section-title">Movimiento</div>
        <div className="mrv__tel-row">
          <div className="mrv__tel-item">
            <span className="mrv__tel-label">GS</span>
            <span className="mrv__tel-value">
              {((currentDrone?.groundspeed ?? 0) * MS_TO_KMH).toFixed(1)}<small>km/h</small>
            </span>
          </div>
          <div className="mrv__tel-item">
            <span className="mrv__tel-label">AS</span>
            <span className="mrv__tel-value">
              {((currentDrone?.airspeed ?? 0) * MS_TO_KMH).toFixed(1)}<small>km/h</small>
            </span>
          </div>
        </div>
        <div className="mrv__tel-item">
          <span className="mrv__tel-label">HEADING</span>
          <div className="mrv__tel-hdg-row">
            <span className="mrv__tel-value mrv__tel-value--mono">
              {headingDeg.toFixed(0).padStart(3, '0')}<small>°</small>
            </span>
            <span className="mrv__tel-hdg-label">{headingLabel}</span>
            {/* Mini compass arc */}
            <svg className="mrv__compass" width="28" height="28" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="12" stroke="rgba(255,255,255,0.12)" strokeWidth="2" fill="none" />
              <line
                x1="14" y1="14"
                x2={14 + 10 * Math.sin(headingDeg * Math.PI / 180)}
                y2={14 - 10 * Math.cos(headingDeg * Math.PI / 180)}
                stroke="#40c8ff" strokeWidth="2" strokeLinecap="round"
              />
              <circle cx="14" cy="14" r="2" fill="#40c8ff" />
            </svg>
          </div>
        </div>

        {/* Section: Sistema */}
        <div className="mrv__tel-section-title">Sistema</div>
        <div className="mrv__tel-item">
          <span className="mrv__tel-label">BATERÍA</span>
          <div className="mrv__tel-bat-row">
            <span className="mrv__tel-value">{(currentDrone?.battery ?? 0).toFixed(0)}<small>%</small></span>
            <div className="mrv__tel-bat-bar">
              <div
                className={`mrv__tel-bat-fill ${
                  (currentDrone?.battery ?? 0) < 20 ? 'mrv__tel-bat-fill--low'
                  : (currentDrone?.battery ?? 0) < 40 ? 'mrv__tel-bat-fill--mid' : ''
                }`}
                style={{ width: `${Math.min(100, currentDrone?.battery ?? 0)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <ReplayAnalysisPanel />
      <ReplayPlotPanel />

      {/* ── Floating controls (bottom center) ── */}
      <div className="mrv__controls">
        {/* Reset */}
        <button
          className="mrv__ctrl-btn"
          onClick={handleReset}
          title="Reiniciar desde el inicio"
        >⏮</button>

        {/* Play / Pause */}
        <button
          className={`mrv__ctrl-btn mrv__ctrl-btn--play ${isPlaying ? 'mrv__ctrl-btn--active' : ''}`}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Stop */}
        <button
          className="mrv__ctrl-btn"
          onClick={handleStop}
          disabled={!isReplaying}
          title="Detener"
        >⏹</button>

        {/* Timeline */}
        <div className="mrv__timeline">
          <span className="mrv__time">{currentTime}</span>
          <input
            type="range"
            className="mrv__slider"
            min={0}
            max={Math.max(0, maxFrames - 1)}
            step={1}
            value={Math.floor(replayIndex)}
            onMouseDown={handleScrubStart}
            onTouchStart={handleScrubStart}
            onChange={handleScrub}
            style={{ '--fill': `${scrubPercent}%` } as React.CSSProperties}
          />
          <span className="mrv__time">{totalDuration}</span>
        </div>

        {/* Speed */}
        <select
          className="mrv__speed"
          value={replaySpeed}
          onChange={handleSpeedChange}
        >
          {SPEED_OPTIONS.map(s => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
      </div>

      {/* ── Debug info strip (small, bottom of controls) ── */}
      <div style={{
        position: 'absolute', bottom: '4.5rem', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.55)',
        fontSize: '0.66rem', fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4,
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        {effectiveDroneId ?? '—'} · {maxFrames}f · {replayState} · idx:{Math.floor(replayIndex)}
      </div>
    </div>
  )
}

export default MissionReplayViewer
