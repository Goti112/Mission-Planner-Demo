/* ═══════════════════════════════════════════════════════════════
   MissionSummary — read-only mission statistics card
   ═══════════════════════════════════════════════════════════════
   Displays:
     • Total path distance (haversine sum)
     • Estimated flight time (distance / avg speed)
     • Waypoint count
     • Average speed
     • Live progress bar + remaining distance / ETA when executing
   Uses existing haversineDistanceM from FlightTelemetryModel.
   ═══════════════════════════════════════════════════════════════ */

import React, { useMemo } from 'react'
import { Route, Timer, Navigation, Gauge, Activity } from 'lucide-react'
import type { Mission } from '../../../types/mission'
import type { MissionProgress } from '..'
import { haversineDistanceM } from '../../telemetry'

/** Default cruise speed when waypoint doesn't specify one (m/s) */
const DEFAULT_SPEED_MS = 5

interface MissionSummaryProps {
  mission: Mission | null
  /** Live navigation progress — provided when this mission is executing. */
  liveProgress?: MissionProgress | null
}

/** Format metres to human-readable distance */
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

/** Format seconds to mm:ss or hh:mm:ss */
function fmtTime(s: number): string {
  if (s <= 0) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}m ${sec.toString().padStart(2, '0')}s`
}

/** Format ETA in seconds, returns '—' for undefined / zero speed. */
function fmtEta(s: number | undefined): string {
  if (s == null || !Number.isFinite(s)) return '—'
  return fmtTime(s)
}

const MissionSummary: React.FC<MissionSummaryProps> = ({ mission, liveProgress }) => {
  const stats = useMemo(() => {
    if (!mission || mission.waypoints.length === 0) {
      return { distanceM: 0, etaSec: 0, wpCount: 0, avgSpeed: 0 }
    }

    const wps = mission.waypoints
    let totalDist = 0
    let totalTime = 0

    for (let i = 1; i < wps.length; i++) {
      const prev = wps[i - 1]
      const curr = wps[i]
      const segDist = haversineDistanceM(prev.lat, prev.lng, curr.lat, curr.lng)
      const speed = curr.speed ?? DEFAULT_SPEED_MS
      totalDist += segDist
      totalTime += segDist / speed
      totalTime += prev.holdTime ?? 0
    }
    // Add hold time of last waypoint
    totalTime += wps[wps.length - 1].holdTime ?? 0

    const avgSpeed =
      wps.length > 1
        ? wps.reduce((a, w) => a + (w.speed ?? DEFAULT_SPEED_MS), 0) / wps.length
        : DEFAULT_SPEED_MS

    return {
      distanceM: totalDist,
      etaSec: totalTime,
      wpCount: wps.length,
      avgSpeed,
    }
  }, [mission])

  if (!mission) return null

  const pct = liveProgress?.missionPercentComplete ?? null

  return (
    <div className="msn-summary">
      {/* ── Static plan statistics ── */}
      <div className="msn-summary__row">
        <Route size={12} className="msn-summary__icon" />
        <span className="msn-summary__label">Distancia</span>
        <span className="msn-summary__value">{fmtDist(stats.distanceM)}</span>
      </div>
      <div className="msn-summary__row">
        <Timer size={12} className="msn-summary__icon" />
        <span className="msn-summary__label">Tiempo est.</span>
        <span className="msn-summary__value">{fmtTime(stats.etaSec)}</span>
      </div>
      <div className="msn-summary__row">
        <Navigation size={12} className="msn-summary__icon" />
        <span className="msn-summary__label">Waypoints</span>
        <span className="msn-summary__value">{stats.wpCount}</span>
      </div>
      <div className="msn-summary__row">
        <Gauge size={12} className="msn-summary__icon" />
        <span className="msn-summary__label">Vel. media</span>
        <span className="msn-summary__value">{(stats.avgSpeed * 3.6).toFixed(1)} km/h</span>
      </div>

      {/* ── Live execution progress (only when mission is running) ── */}
      {liveProgress && (
        <>
          <div className="msn-summary__divider" />

          {/* Progress bar */}
          <div className="msn-summary__progress-bar-wrap">
            <div
              className="msn-summary__progress-bar-fill"
              style={{ width: `${pct?.toFixed(1) ?? 0}%` }}
            />
          </div>

          <div className="msn-summary__row">
            <Activity size={12} className="msn-summary__icon msn-summary__icon--live" />
            <span className="msn-summary__label">En vuelo</span>
            <span className="msn-summary__value msn-summary__value--live">
              WP {liveProgress.currentWaypointIndex + 1}/{liveProgress.totalWaypoints}
              &nbsp;·&nbsp;{pct?.toFixed(0)}%
            </span>
          </div>
          <div className="msn-summary__row">
            <Route size={12} className="msn-summary__icon" />
            <span className="msn-summary__label">Restante</span>
            <span className="msn-summary__value">
              {fmtDist(liveProgress.totalDistanceRemaining)}
            </span>
          </div>
          <div className="msn-summary__row">
            <Timer size={12} className="msn-summary__icon" />
            <span className="msn-summary__label">ETA</span>
            <span className="msn-summary__value">{fmtEta(liveProgress.etaSeconds)}</span>
          </div>
        </>
      )}
    </div>
  )
}

export default MissionSummary
