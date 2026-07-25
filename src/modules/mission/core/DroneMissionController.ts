/* ═══════════════════════════════════════════════════════════════
   DroneMissionController — Central mission execution engine
   ═══════════════════════════════════════════════════════════════

   ┌──────────────────────────────────────────────────────────┐
   │  RESPONSIBILITY                                          │
   │                                                          │
   │  • Manages the DroneState finite state machine for       │
   │    every DroneEntity.                                    │
   │  • Owns ALL waypoint navigation logic via                │
   │    NavigationController instances (one per active drone) │
   │  • Owns its own rAF animation loop — starts on           │
   │    startMission(), self-terminates when no active         │
   │    entities remain. ZERO React dependency.               │
   │  • Exposes startMission / pauseMission / resumeMission / │
   │    abortMission for UI controls.                         │
   │  • Writes interpolated position to the drone store so    │
   │    both 2D map and 3D scene update in real-time.         │
   │  • Supports multiple drones simultaneously.              │
   └──────────────────────────────────────────────────────────┘

   ── STATE TRANSITIONS ──────────────────────────────────────

     IDLE ──(startMission)──► TAKING_OFF
     TAKING_OFF ──(after TAKEOFF_DURATION)──► EN_ROUTE
     EN_ROUTE ──(all waypoints done)──► COMPLETED
     EN_ROUTE ──(pauseMission)──► PAUSED
     PAUSED ──(resumeMission)──► EN_ROUTE
     Any ──(abortMission)──► ABORTED → IDLE

   ═══════════════════════════════════════════════════════════════ */

import { DroneEntity } from '../../drone/core/DroneEntity'
import { PUBLIC_ASSET_URLS } from '../../../shared/utils/publicAssetUrl'
import { DroneState } from '../../drone/core/DroneState'
import { NavigationController } from './navigation/NavigationController'
import type { NavControllerConfig } from './navigation/NavigationController'
import { FlightDynamics } from './flight/FlightDynamics'
import { useMissionStore } from '../store/missionStore'
import { useDroneStore } from '../../drone'
import { droneRuntime, DroneMovementMode } from '../../drone'
import { FlightMode, calculateBearing } from '../../telemetry'
import { missionStateController } from './MissionStateController'
import { MissionState } from './MissionState'
import { missionProgressCalculator } from './MissionProgressCalculator'
import { useMissionProgressStore } from '../store/missionProgressStore'
import { flightEventLog } from '../services/FlightEventLog'


/** Seconds the drone spends in TAKING_OFF before EN_ROUTE */
const TAKEOFF_DURATION = 2.0

/** Default NavigationController configuration (per-drone, overridden by entity.speed) */
const DEFAULT_NAV_CONFIG: Partial<NavControllerConfig> = {
  cruiseSpeedMs:        12,
  maxTurnRateDegPerSec: 35,
  maxAccelMs2:          2000,
  arrivalRadiusM:       6,
}

/** How often (seconds) to push progress updates to the Zustand store for UI */
const PROGRESS_STORE_INTERVAL = 0.1 // 10 Hz — plenty for a progress bar

export class DroneMissionController {
  /* ── Internal maps ── */
  private entities: Map<string, DroneEntity> = new Map()
  /** droneId → missionId currently assigned */
  private missionAssignments: Map<string, string> = new Map()
  /** droneId → NavigationController instance for active mission (one per drone) */
  private navControllers: Map<string, NavigationController> = new Map()
  /** droneId → FlightDynamics instance for smooth attitude simulation (one per drone) */
  private flightDynamics: Map<string, FlightDynamics> = new Map()
  /** droneId → elapsed seconds in TAKING_OFF */
  private takeoffTimers: Map<string, number> = new Map()
  /** droneId → original altitude at mission start (for takeoff lerp) */
  private takeoffStartAlt: Map<string, number> = new Map()
  /** droneId → previous altitude for climb-rate calculation */
  private prevAlt: Map<string, number> = new Map()
  /** droneId → previous yaw for bank-angle calculation */
  private prevYaw: Map<string, number> = new Map()
  /** droneId → target altitude for first waypoint during takeoff */
  private takeoffTargetAlt: Map<string, number> = new Map()

  /* ── Flight event log tracking ── */
  /** droneId → last waypoint index seen (detects waypoint arrivals) */
  private _lastWpIndex: Map<string, number> = new Map()
  /** droneId → last altitude at which a climb/descend log was emitted */
  private _lastLoggedAlt: Map<string, number> = new Map()
  /** droneId → battery warning level sent ('ok' | 'low' | 'critical') */
  private _battWarnState: Map<string, string> = new Map()
  /** droneId → mission start timestamp (ms) for duration reporting */
  private _missionStartTime: Map<string, number> = new Map()

  /** droneId → heading toward first waypoint during takeoff */
  private takeoffHeading: Map<string, number> = new Map()

  /* ── RTL (Return-To-Launch) state ── */
  /** droneId → home latitude captured at RTL trigger */
  private _rtlHomeLat: Map<string, number> = new Map()
  /** droneId → home longitude captured at RTL trigger */
  private _rtlHomeLng: Map<string, number> = new Map()
  /** droneId → safe altitude to ascend to before returning (m AGL) */
  private _rtlAscendTarget: Map<string, number> = new Map()
  /** droneId → NavigationController for the RTL return leg */
  private _rtlNavCtrl: Map<string, NavigationController> = new Map()

  /* ── Self-managed animation loop ── */
  private _rafId: number | null = null
  private _lastTime = 0
  private _progressAccumulator = 0

  /* ──────────────────────────────────────────────────────────
     Animation loop — completely independent of React
     ────────────────────────────────────────────────────────── */

  /** Start the rAF loop if not already running. Called automatically by startMission(). */
  private _startLoop(): void {
    if (this._rafId !== null) return // already running
    this._lastTime = 0
    this._progressAccumulator = 0
    if (import.meta.env.DEV) console.log('[DroneMissionController] ▶ Animation loop started')

    const tick = (now: number) => {
      if (this._lastTime === 0) this._lastTime = now
      const dt = Math.min((now - this._lastTime) / 1000, 0.1) // cap at 100 ms
      this._lastTime = now

      this.update(dt)

      // Self-terminate when nothing is active
      if (this._hasActiveEntities()) {
        this._rafId = requestAnimationFrame(tick)
      } else {
        this._rafId = null
        this._lastTime = 0
        this._progressAccumulator = 0
        if (import.meta.env.DEV) console.log('[DroneMissionController] ■ Animation loop stopped (no active entities)')
      }
    }

    this._rafId = requestAnimationFrame(tick)
  }

  /** Force-stop the loop (used by abortMission when no more active entities) */
  private _stopLoop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
      this._lastTime = 0
      this._progressAccumulator = 0
    }
  }

  /** Returns true if at least one entity is in an active state */
  private _hasActiveEntities(): boolean {
    for (const entity of this.entities.values()) {
      if (
        entity.state !== DroneState.IDLE &&
        entity.state !== DroneState.COMPLETED &&
        entity.state !== DroneState.ABORTED
      ) {
        return true
      }
    }
    return false
  }

  /** Whether the animation loop is currently running */
  get isRunning(): boolean {
    return this._rafId !== null
  }

  /* ──────────────────────────────────────────────────────────
     Entity management
     ────────────────────────────────────────────────────────── */

  addEntity(entity: DroneEntity): void {
    this.entities.set(entity.id, entity)
  }

  removeEntity(id: string): void {
    this.entities.delete(id)
    this.missionAssignments.delete(id)
    this.navControllers.delete(id)
    this.flightDynamics.delete(id)
    this.takeoffTimers.delete(id)
    this.takeoffStartAlt.delete(id)
    this.prevAlt.delete(id)
    this.prevYaw.delete(id)
    this.takeoffTargetAlt.delete(id)
    this.takeoffHeading.delete(id)
    this._lastWpIndex.delete(id)
    this._lastLoggedAlt.delete(id)
    this._battWarnState.delete(id)
    this._missionStartTime.delete(id)
    // RTL cleanup
    this._rtlHomeLat.delete(id)
    this._rtlHomeLng.delete(id)
    this._rtlAscendTarget.delete(id)
    this._rtlNavCtrl.delete(id)
  }

  getEntity(id: string): DroneEntity | undefined {
    return this.entities.get(id)
  }

  getAllEntities(): DroneEntity[] {
    return Array.from(this.entities.values())
  }

  getAssignedMission(droneId: string): string | undefined {
    return this.missionAssignments.get(droneId)
  }

  /* ──────────────────────────────────────────────────────────
     Mission controls (called from UI)
     ────────────────────────────────────────────────────────── */

  startMission(droneId: string, missionId: string): void {
    const entity = this.entities.get(droneId)
    if (!entity) {
      if (import.meta.env.DEV) console.warn(`[DroneMissionController] No entity for drone ${droneId}`)
      return
    }

    const mission = useMissionStore.getState().missions[missionId]
    if (!mission || mission.waypoints.length === 0) {
      if (import.meta.env.DEV) console.warn(`[DroneMissionController] Mission ${missionId} not found or empty`)
      return
    }

    // Guard: prevent double-start (e.g. UI fires twice, stale click)
    if (
      entity.state !== DroneState.IDLE &&
      entity.state !== DroneState.COMPLETED &&
      entity.state !== DroneState.ABORTED
    ) {
      if (import.meta.env.DEV)
        console.warn(
          `[DroneMissionController] ${droneId} already active (${entity.state}) — abort the current mission first`,
        )
      return
    }

    // Claim exclusive movement authority for this drone before the loop starts
    droneRuntime.setMovementMode(droneId, DroneMovementMode.MISSION)

    // ── Sync MissionStateController → TAKEOFF ──────────────────────────────
    // DroneMissionController may be called directly (bypassing MissionEngine)
    // so it must own the IDLE/ARMING → TAKEOFF transition itself.
    {
      const mscState = missionStateController.getState(droneId)
      if (mscState === MissionState.IDLE) {
        missionStateController.transition(droneId, MissionState.ARMING, missionId)
        missionStateController.transition(droneId, MissionState.TAKEOFF, missionId)
      } else if (mscState === MissionState.ARMING) {
        missionStateController.transition(droneId, MissionState.TAKEOFF, missionId)
      } else if (mscState === MissionState.COMPLETED || mscState === MissionState.ABORTED) {
        // Allow re-start after a completed or aborted mission
        missionStateController.forceReset(droneId)
        missionStateController.transition(droneId, MissionState.ARMING, missionId)
        missionStateController.transition(droneId, MissionState.TAKEOFF, missionId)
      }
      // Already TAKEOFF (set by MissionEngine)? No-op.
    }

    this.missionAssignments.set(droneId, missionId)
    this.takeoffTimers.set(droneId, 0)

    // Record the drone's current altitude for takeoff lerp
    const drone = useDroneStore.getState().drones[droneId]
    const startAlt = drone?.altitude ?? 0
    this.takeoffStartAlt.set(droneId, startAlt)
    this.prevAlt.set(droneId, startAlt)
    this.prevYaw.set(droneId, drone?.yaw ?? 0)

    // Target altitude = first waypoint's altitude
    const targetAlt = mission.waypoints[0]?.altitude ?? startAlt + 15
    this.takeoffTargetAlt.set(droneId, targetAlt)

    // Heading toward first waypoint (for takeoff yaw)
    const wp0 = mission.waypoints[0]
    if (wp0 && drone) {
      const hdg = calculateBearing(drone.lat, drone.lng, wp0.lat, wp0.lng)
      this.takeoffHeading.set(droneId, hdg)
    } else {
      this.takeoffHeading.set(droneId, drone?.yaw ?? 0)
    }

    // Set entity state to TAKING_OFF
    entity.setState(DroneState.TAKING_OFF)

    // Mark mission as running in store
    useMissionStore.getState().startMission(missionId)

    // Update drone store
    useDroneStore.getState().updateDrone(droneId, {
      mode: 'GUIDED',
      missionState: DroneState.TAKING_OFF,
    })

    if (import.meta.env.DEV) console.log(`[DroneMissionController] Mission ${missionId} → TAKING_OFF for ${droneId}`)

    // Log mission start
    flightEventLog.logEvent(droneId, 'TAKEOFF', `Takeoff initiated, target altitude ${Math.round(targetAlt)}m`)
    flightEventLog.logEvent(droneId, 'MISSION_START', `Mission started with ${mission.waypoints.length} waypoint${mission.waypoints.length !== 1 ? 's' : ''}`)
    this._missionStartTime.set(droneId, Date.now())
    this._battWarnState.set(droneId, 'ok')

    // Reset battery to 100 % so each simulation mission starts fresh.
    // Without this, a previously-depleted SimSource would carry over its
    // drained batteryPct, causing false CRITICAL_BATTERY alerts and blocking
    // mission validation on the next start.
    droneRuntime.getSource(droneId)?.resetBattery()

    // START the animation loop — guaranteed to tick on the next frame
    this._startLoop()
  }

  pauseMission(droneId: string): void {
    const entity = this.entities.get(droneId)
    const missionId = this.missionAssignments.get(droneId)
    if (!entity || !missionId) return

    if (entity.state === DroneState.EN_ROUTE) {
      entity.setState(DroneState.PAUSED)
      this.navControllers.get(droneId)?.pause()
      useMissionStore.getState().pauseMission(missionId)
      useDroneStore.getState().updateDrone(droneId, {
        missionState: DroneState.PAUSED,
      })

      // Sync MissionStateController so the navbar/telemetry panel update
      missionStateController.transition(droneId, MissionState.PAUSED)

      // Log pause event
      flightEventLog.logEvent(droneId, 'MISSION_PAUSE', 'Mission paused')

      // Push hover override — zero speed at current position
      const pos = entity.position
      droneRuntime.pushMissionState(droneId, {
        lat: pos.lat,
        lon: pos.lng,
        altAGL: pos.altitude,
        headingDeg: entity.orientation.yaw,
        groundSpeed: 0,
        climbRate: 0,
        pitchDeg: 0,
        rollDeg: 0,
        armed: true,
        mode: FlightMode.LOITER,
        wpDist: 0,
      })

      if (import.meta.env.DEV) console.log(`[DroneMissionController] ${droneId} → PAUSED`)
    }
  }

  resumeMission(droneId: string): void {
    const entity = this.entities.get(droneId)
    const missionId = this.missionAssignments.get(droneId)
    if (!entity || !missionId) return

    if (entity.state === DroneState.PAUSED) {
      entity.setState(DroneState.EN_ROUTE)
      this.navControllers.get(droneId)?.resume()
      useMissionStore.getState().resumeMission(missionId)
      useDroneStore.getState().updateDrone(droneId, {
        missionState: DroneState.EN_ROUTE,
      })
      // Sync MissionStateController so the navbar/telemetry panel update
      missionStateController.transition(droneId, MissionState.MISSION_RUNNING)

      // Log resume event
      flightEventLog.logEvent(droneId, 'MISSION_RESUME', 'Mission resumed')

      if (import.meta.env.DEV) console.log(`[DroneMissionController] ${droneId} → EN_ROUTE (resumed)`)

      // Ensure the loop is running
      this._startLoop()
    }
  }

  abortMission(droneId: string): void {
    const entity = this.entities.get(droneId)
    const missionId = this.missionAssignments.get(droneId)
    if (!entity || !missionId) return

    entity.setState(DroneState.ABORTED)
    useMissionStore.getState().stopMission(missionId)
    useMissionProgressStore.getState().clearProgress(droneId)
    missionProgressCalculator.clearDrone(droneId)
    missionProgressCalculator.clearMission(missionId)
    this.missionAssignments.delete(droneId)
    this.navControllers.delete(droneId)
    this.flightDynamics.delete(droneId)
    this.takeoffTimers.delete(droneId)
    this.takeoffStartAlt.delete(droneId)
    this.takeoffTargetAlt.delete(droneId)
    this.takeoffHeading.delete(droneId)
    this.prevAlt.delete(droneId)
    this.prevYaw.delete(droneId)

    // Log abort event
    flightEventLog.logEvent(droneId, 'MISSION_ABORT', 'Mission aborted')
    this._lastWpIndex.delete(droneId)
    this._lastLoggedAlt.delete(droneId)
    this._battWarnState.delete(droneId)
    this._missionStartTime.delete(droneId)

    // Sync MissionStateController — transition from current state → ABORTED
    missionStateController.transition(droneId, MissionState.ABORTED)

    // Push hover override at current position — drone stays in place
    // (do NOT clear override or the sim scenario will snap the drone elsewhere)
    const pos = entity.position
    droneRuntime.pushMissionState(droneId, {
      lat: pos.lat,
      lon: pos.lng,
      altAGL: pos.altitude,
      headingDeg: entity.orientation.yaw,
      groundSpeed: 0,
      climbRate: 0,
      pitchDeg: 0,
      rollDeg: 0,
      armed: true,
      mode: FlightMode.LOITER,
      wpDist: 0,
    })

    useDroneStore.getState().updateDrone(droneId, {
      mode: 'LOITER',
      missionState: DroneState.ABORTED,
    })

    if (import.meta.env.DEV) console.log(`[DroneMissionController] ${droneId} → ABORTED`)

    // Release mission authority — override stays active so drone hasn't snapped.
    // Do this before the IDLE transition so the SimSource doesn't re-engage demo.
    droneRuntime.setMovementMode(droneId, DroneMovementMode.IDLE)

    // Transition to IDLE after a brief moment
    setTimeout(() => {
      if (entity.state === DroneState.ABORTED) {
        entity.setState(DroneState.IDLE)
        useDroneStore.getState().updateDrone(droneId, {
          missionState: DroneState.IDLE,
        })
        missionStateController.transition(droneId, MissionState.IDLE)
      }
    }, 500)
  }

  /* ──────────────────────────────────────────────────────────
     update(deltaTime) — called from the self-managed rAF loop

     Advances each drone according to its current state.
     All position computation happens HERE (not in the store).
     ────────────────────────────────────────────────────────── */

  update(deltaTime: number): void {
    // Accumulate time for throttled store updates
    this._progressAccumulator += deltaTime
    const shouldUpdateProgress = this._progressAccumulator >= PROGRESS_STORE_INTERVAL

    for (const [droneId, entity] of this.entities) {
      const missionId = this.missionAssignments.get(droneId)

      switch (entity.state) {
        /* ── IDLE: waiting ── */
        case DroneState.IDLE:
          break

        /* ── TAKING_OFF: altitude increase toward first waypoint ── */
        case DroneState.TAKING_OFF: {
          if (!missionId) break
          // Safety guard — another controller may have stolen authority
          if (droneRuntime.getMovementMode(droneId) !== DroneMovementMode.MISSION) {
            if (import.meta.env.DEV)
              console.warn(`[DroneMissionController] ${droneId} TAKING_OFF blocked — movementMode=${droneRuntime.getMovementMode(droneId)}`)
            break
          }
          // ── Mission State Machine guard: only move if state allows it ──
          if (!missionStateController.canMove(droneId)) {
            if (import.meta.env.DEV)
              console.warn(`[DroneMissionController] ${droneId} TAKING_OFF blocked — missionState=${missionStateController.getState(droneId)}`)
            break
          }
          const elapsed = (this.takeoffTimers.get(droneId) ?? 0) + deltaTime
          this.takeoffTimers.set(droneId, elapsed)

          const mission = useMissionStore.getState().missions[missionId]
          if (!mission) break

          const targetAlt = this.takeoffTargetAlt.get(droneId) ?? 15
          const startAlt = this.takeoffStartAlt.get(droneId) ?? 0
          const heading = this.takeoffHeading.get(droneId) ?? 0
          const entityPos = entity.position

          if (elapsed >= TAKEOFF_DURATION) {
            // Takeoff complete → create NavigationController and switch to EN_ROUTE
            entity.setState(DroneState.EN_ROUTE)
            this.takeoffTimers.delete(droneId)
            this.takeoffStartAlt.delete(droneId)
            this.takeoffTargetAlt.delete(droneId)
            this.takeoffHeading.delete(droneId)

            // ── Mission State Machine: TAKEOFF → MISSION_RUNNING ──
            missionStateController.transition(droneId, MissionState.MISSION_RUNNING)

            // Log takeoff complete and initialize log tracking
            flightEventLog.logEvent(droneId, 'TAKEOFF_COMPLETE', `Airborne at ${Math.round(targetAlt)}m`)
            this._lastLoggedAlt.set(droneId, targetAlt)
            this._lastWpIndex.set(droneId, 0) // targeting WP index 0

            // ── STEP 9: Create per-drone NavigationController ──────────────
            // Each drone gets its own isolated controller instance.
            // States are never shared across drones.
            const navCtrl = new NavigationController(
              mission.waypoints,
              entityPos.lat,
              entityPos.lng,
              targetAlt,
              heading,
              { ...DEFAULT_NAV_CONFIG, cruiseSpeedMs: entity.speed },
            )
            this.navControllers.set(droneId, navCtrl)
            // Per-drone FlightDynamics — smooth roll/pitch attitude simulation
            this.flightDynamics.set(droneId, new FlightDynamics(heading))
            this.prevYaw.set(droneId, heading)

            // Push final takeoff state through telemetry pipeline
            droneRuntime.pushMissionState(droneId, {
              lat: entityPos.lat,
              lon: entityPos.lng,
              altAGL: targetAlt,
              headingDeg: heading,
              groundSpeed: 0,
              climbRate: 0,
              pitchDeg: 0,
              rollDeg: 0,
              armed: true,
              mode: FlightMode.AUTO,
              wpDist: 0,
            })

            // Set mission to running in the store
            useMissionStore.getState().resumeMission(missionId)

            useDroneStore.getState().updateDrone(droneId, {
              missionState: DroneState.EN_ROUTE,
              mode: 'AUTO',
            })

            if (import.meta.env.DEV) console.log(`[DroneMissionController] ${droneId} → EN_ROUTE (alt=${targetAlt}m)`)
          } else {
            // Smooth ease-out altitude lerp
            const tProg = elapsed / TAKEOFF_DURATION
            const eased = 1 - Math.pow(1 - tProg, 3)
            const newAlt = startAlt + (targetAlt - startAlt) * eased

            // Compute climb rate
            const prevAltVal = this.prevAlt.get(droneId) ?? startAlt
            const climbRate = deltaTime > 0 ? (newAlt - prevAltVal) / deltaTime : 0
            this.prevAlt.set(droneId, newAlt)

            // Update entity position
            entity.updatePosition(entityPos.lat, entityPos.lng, newAlt)

            // Push through telemetry pipeline — NO direct droneStore writes
            droneRuntime.pushMissionState(droneId, {
              lat: entityPos.lat,
              lon: entityPos.lng,
              altAGL: newAlt,
              headingDeg: heading,
              groundSpeed: 0,
              climbRate,
              pitchDeg: Math.min(10, climbRate * 2), // slight nose up during climb
              rollDeg: 0,
              armed: true,
              mode: FlightMode.TAKEOFF,
              wpDist: Math.max(0, targetAlt - newAlt),
            })
          }
          break
        }

        /* ── EN_ROUTE: NavigationController drives traversal ──────────────
           STEP 8: Only runs when missionState === MISSION_RUNNING.
           Guards prevent movement in any other lifecycle state.
           ────────────────────────────────────────────────────────── */
        case DroneState.EN_ROUTE: {
          if (!missionId) break
          // ── STEP 9: Per-drone isolation — each drone has its own controller ──
          const ctrl = this.navControllers.get(droneId)
          if (!ctrl) break
          // Safety guard — another controller may have stolen authority
          if (droneRuntime.getMovementMode(droneId) !== DroneMovementMode.MISSION) {
            if (import.meta.env.DEV)
              console.warn(`[DroneMissionController] ${droneId} EN_ROUTE blocked — movementMode=${droneRuntime.getMovementMode(droneId)}`)
            break
          }
          // ── Mission State Machine guard (STEP 8) ──
          // NavigationController only advances when MISSION_RUNNING.
          if (!missionStateController.canMove(droneId)) {
            if (import.meta.env.DEV)
              console.warn(`[DroneMissionController] ${droneId} EN_ROUTE blocked — missionState=${missionStateController.getState(droneId)}`)
            break
          }

          // ── Advance the NavigationController one tick ──────────────────────
          // Returns smooth heading, speed, altitude, and position updates.
          const state = ctrl.update(deltaTime)

          // ── Waypoint arrival detection ────────────────────────────────────
          const prevWpIdx = this._lastWpIndex.get(droneId) ?? state.currentWpIndex
          if (state.currentWpIndex > prevWpIdx) {
            // Drone advanced past one or more waypoints
            for (let w = prevWpIdx; w < state.currentWpIndex; w++) {
              flightEventLog.logEvent(droneId, 'WAYPOINT_REACHED', `Reached waypoint ${w + 1}`)
            }
          }
          this._lastWpIndex.set(droneId, state.currentWpIndex)

          // climbRate is computed internally by the altitude controller.
          const climbRate = state.verticalSpeed

          // ── FlightDynamics: smooth roll & pitch attitude ───────────────────
          // Each drone has its own isolated FlightDynamics instance.
          // Produces bank angle from turn rate + pitch from climb rate,
          // both rate-limited for realistic transitions.
          const flightDyn = this.flightDynamics.get(droneId)
          let rollDeg  = 0
          let pitchDeg = 0
          if (flightDyn) {
            const attitude = flightDyn.update(deltaTime, state.yaw, state.verticalSpeed)
            rollDeg  = attitude.rollDeg
            pitchDeg = attitude.pitchDeg
          }

          // ── Push through telemetry pipeline — single source of truth ──────
          // ALL position/attitude updates flow through DroneStateManager →
          // SimulationTelemetrySource → TelemetryManager → droneStore.
          // No direct droneStore position writes here.
          droneRuntime.pushMissionState(droneId, {
            lat:         state.lat,
            lon:         state.lng,
            altAGL:      state.altitude,
            headingDeg:  state.yaw,
            groundSpeed: state.completed ? 0 : state.speed,
            climbRate,
            pitchDeg,
            rollDeg,
            armed:       true,
            mode:        FlightMode.AUTO,
            wpDist:      0,
          })

          // Update metadata in droneStore (mode/missionState — not positional)
          useDroneStore.getState().updateDrone(droneId, {
            mode:         'AUTO',
            missionState: DroneState.EN_ROUTE,
          })

          // Throttled: push progress to mission store for UI (~10 Hz)
          if (shouldUpdateProgress) {
            useMissionStore.getState().updateMissionProgress(
              missionId,
              state.currentWpIndex,
              state.segmentProgress,
            )

            // Compute and publish rich navigation progress metrics
            const missionForProgress = useMissionStore.getState().missions[missionId]
            if (missionForProgress?.waypoints.length) {
              const mp = missionProgressCalculator.calculate(
                droneId,
                missionId,
                missionForProgress.waypoints,
                state.currentWpIndex,
                state.segmentProgress,
                state.lat,
                state.lng,
                state.speed,
              )
              useMissionProgressStore.getState().updateProgress(droneId, mp)
            }
          }

          // Sync entity position (for internal DroneEntity state tracking)
          entity.updatePosition(state.lat, state.lng, state.altitude)
          entity.updateOrientation(pitchDeg, rollDeg, state.yaw)

          // ── Altitude change logging (threshold: 5m) ───────────────────────
          if (shouldUpdateProgress) {
            const lastLoggedAlt = this._lastLoggedAlt.get(droneId)
            if (lastLoggedAlt !== undefined) {
              const altDelta = state.altitude - lastLoggedAlt
              if (Math.abs(altDelta) >= 5) {
                const dir = altDelta > 0 ? 'Climb' : 'Descend'
                flightEventLog.logEvent(
                  droneId,
                  'ALTITUDE_CHANGE',
                  `${dir} to ${Math.round(state.altitude)}m`,
                )
                this._lastLoggedAlt.set(droneId, state.altitude)
              }
            }

            // ── Battery safety monitoring ────────────────────────────────────
            const drone = useDroneStore.getState().drones[droneId]
            if (drone) {
              const batt = drone.battery
              const warnLevel = this._battWarnState.get(droneId) ?? 'ok'
              if (batt <= 10 && warnLevel !== 'critical') {
                flightEventLog.logEvent(droneId, 'BATTERY_CRITICAL', `Critical battery: ${batt}%`)
                this._battWarnState.set(droneId, 'critical')
              } else if (batt <= 20 && batt > 10 && warnLevel === 'ok') {
                flightEventLog.logEvent(droneId, 'BATTERY_LOW', `Low battery warning: ${batt}%`)
                this._battWarnState.set(droneId, 'low')
              }
            }
          }

          // Check completion
          if (state.completed) {
            entity.setState(DroneState.COMPLETED)
            this.missionAssignments.delete(droneId)
            this.navControllers.delete(droneId)
            this.flightDynamics.delete(droneId)
            this.prevYaw.delete(droneId)

            // Sync MissionStateController → COMPLETED, then auto-reset to IDLE
            missionStateController.transition(droneId, MissionState.COMPLETED)

            // Log mission completion with duration
            const startTime = this._missionStartTime.get(droneId)
            const durationStr = startTime
              ? ` in ${Math.round((Date.now() - startTime) / 1000)}s`
              : ''
            flightEventLog.logEvent(droneId, 'MISSION_COMPLETE', `Mission completed${durationStr}`)
            this._lastWpIndex.delete(droneId)
            this._lastLoggedAlt.delete(droneId)
            this._battWarnState.delete(droneId)
            this._missionStartTime.delete(droneId)

            setTimeout(() => {
              missionStateController.transition(droneId, MissionState.IDLE)
              if (entity.state === DroneState.COMPLETED) {
                entity.setState(DroneState.IDLE)
                useDroneStore.getState().updateDrone(droneId, { missionState: DroneState.IDLE })
              }
            }, 3000)

            // Keep mission override active with final hover state —
            // the drone stays at its final position, no snap back to home.
            droneRuntime.pushMissionState(droneId, {
              lat:         state.lat,
              lon:         state.lng,
              altAGL:      state.altitude,
              headingDeg:  state.yaw,
              groundSpeed: 0,
              climbRate:   0,
              pitchDeg:    0,
              rollDeg:     0,
              armed:       true,
              mode:        FlightMode.LOITER,
              wpDist:      0,
            })

            useMissionStore.getState().completeMission(missionId)
            useMissionProgressStore.getState().clearProgress(droneId)
            missionProgressCalculator.clearDrone(droneId)
            missionProgressCalculator.clearMission(missionId)
            useDroneStore.getState().updateDrone(droneId, {
              mode:         'LOITER',
              missionState: DroneState.COMPLETED,
            })

            // Release mission authority — the hover override stays active in
            // SimSource so the drone remains visible at its final position.
            droneRuntime.setMovementMode(droneId, DroneMovementMode.IDLE)

            if (import.meta.env.DEV) console.log(`[DroneMissionController] ${droneId} → COMPLETED (alt=${state.altitude}m)`)
          }
          break
        }

        /* ── PAUSED: frozen in place ── */
        case DroneState.PAUSED:
          break

        /* ── COMPLETED / ABORTED ── */
        case DroneState.COMPLETED:
        case DroneState.ABORTED:
          break
      }
    }

    // Reset accumulator after all entities processed
    if (shouldUpdateProgress) {
      this._progressAccumulator = 0
    }
  }

  /* ──────────────────────────────────────────────────────────
     Utility
     ────────────────────────────────────────────────────────── */

  syncEntitiesWithStore(): void {
    const drones = useDroneStore.getState().drones

    for (const drone of Object.values(drones)) {
      if (!this.entities.has(drone.id)) {
        this.addEntity(new DroneEntity(drone, PUBLIC_ASSET_URLS.droneModel, 12))
      }
    }

    for (const id of this.entities.keys()) {
      if (!drones[id]) {
        this.removeEntity(id)
      }
    }
  }

  /**
   * Stop all controller-owned mission work and synchronously return registered
   * drones to an idle runtime state before an external scenario reset replaces
   * the Zustand stores.
   */
  resetRuntimeToIdle(): void {
    const droneIds = new Set<string>([
      ...this.entities.keys(),
      ...this.missionAssignments.keys(),
    ])

    this._stopLoop()

    for (const droneId of droneIds) {
      const missionId = this.missionAssignments.get(droneId)

      if (missionId !== undefined) {
        useMissionStore.getState().stopMission(missionId)
        missionProgressCalculator.clearMission(missionId)
      }

      this.entities.get(droneId)?.setState(DroneState.IDLE)
      useMissionProgressStore.getState().clearProgress(droneId)
      missionProgressCalculator.clearDrone(droneId)
      droneRuntime.clearMissionState(droneId)
      droneRuntime.resetInterpolator(droneId)
      missionStateController.forceReset(droneId)
    }

    this.missionAssignments.clear()
    this.navControllers.clear()
    this.flightDynamics.clear()
    this.takeoffTimers.clear()
    this.takeoffStartAlt.clear()
    this.takeoffTargetAlt.clear()
    this.takeoffHeading.clear()
    this.prevAlt.clear()
    this.prevYaw.clear()
    this._lastWpIndex.clear()
    this._lastLoggedAlt.clear()
    this._battWarnState.clear()
    this._missionStartTime.clear()
    this._rtlHomeLat.clear()
    this._rtlHomeLng.clear()
    this._rtlAscendTarget.clear()
    this._rtlNavCtrl.clear()
  }

  /** Clean up — cancel loop if running */
  destroy(): void {
    this._stopLoop()
    // Release movement authority for every registered drone
    for (const id of this.entities.keys()) {
      droneRuntime.setMovementMode(id, DroneMovementMode.IDLE)
    }
    this.entities.clear()
    this.missionAssignments.clear()
    this.navControllers.clear()
    this.flightDynamics.clear()
    this.takeoffTimers.clear()
    this.takeoffStartAlt.clear()
    this.takeoffTargetAlt.clear()
    this.takeoffHeading.clear()
    this.prevAlt.clear()
    this.prevYaw.clear()
    this._lastWpIndex.clear()
    this._lastLoggedAlt.clear()
    this._battWarnState.clear()
    this._missionStartTime.clear()
  }
}

/* ═══════════════════════════════════════════════════════════════
   Singleton — shared by all UI panels and render loops
   ═══════════════════════════════════════════════════════════════ */
export const droneMissionController = new DroneMissionController()
