/**
 * useFailsafeMonitor.ts — Failsafe evaluation loop hook
 *
 * Evaluates all failsafe rules at ~1 Hz for every drone in the store.
 * Designed to be called once at the App root level.
 *
 * Data sources:
 *   • drone.battery, altitude, lat, lng, missionState → useDroneStore
 *   • GPS satellite count                             → droneStateManager.getManager(id)?.getSnapshot()
 *   • Packet liveness timestamp                       → TelemetryManager.lastTelemetryAt
 *
 * Signal-loss detection:
 *   In simulation, all drones always have telemetry (manager is always present).
 *   Signal loss can only be triggered via failsafeManager.simulateSignalLoss().
 *   A missing manager is treated as a connected simulation.
 *
 * isAirborne heuristic:
 *   altitude > 1m  OR  missionState not in [IDLE, COMPLETED, ABORTED]
 */

import { useEffect, useRef } from 'react';
import { useDroneStore, droneRuntime } from '../../drone';
import { failsafeManager } from '../../../systems/failsafe/FailsafeManager';
import { DroneState } from '../../drone/core/DroneState';
import type { FailsafeInput } from '../../../systems/failsafe/FailsafeTypes';
import type { Drone } from '../../drone';

/** Evaluation frequency in milliseconds (1 Hz). */
const EVAL_INTERVAL_MS = 1000;

/**
 * Mounts a 1-second interval that evaluates all failsafe rules for every drone.
 *
 * Call this once at the App root (no arguments, no return value).
 */
export function useFailsafeMonitor(): void {
  // Use refs so the interval closure always reads the latest values
  // without needing to be recreated on every store change.
  const dronesRef = useRef<Record<string, Drone>>({});

  // Keep refs in sync with store state
  useDroneStore((s) => {
    dronesRef.current = s.drones;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const drones = dronesRef.current;
      const nowMs = Date.now();

      for (const drone of Object.values(drones)) {
        const droneId = drone.id;

        // —— Satellite count ———————————————————————————————————————————————
        // Prefer live telemetry; fall back to 12 (healthy) when unavailable.
        const manager = droneRuntime.getManager(droneId);
        const snapshot = manager?.getSnapshot();
        const satCount = snapshot?.gpsStatus.satellitesVisible ?? 12;

        // —— Last telemetry timestamp —————————————————————————————————————
        // Use real packet timestamps from TelemetryManager.
        const lastTelemetryMs = manager?.lastTelemetryAt ?? nowMs;

        // —— isAirborne —————————————————————————————————————————————————————
        // Drone is considered airborne if above 1 m or actively in mission.
        const missionState = drone.missionState;
        const missionActive =
          missionState !== DroneState.IDLE &&
          missionState !== DroneState.COMPLETED &&
          missionState !== DroneState.ABORTED;
        const isAirborne = drone.altitude > 1 || missionActive;

        // —— Connected —————————————————————————————————————————————————————
        const input: FailsafeInput = {
          droneId,
          batteryPercent: drone.battery,
          satelliteCount: satCount,
          altitudeM: drone.altitude,
          lat: drone.lat,
          lng: drone.lng,
          connected: manager?.isConnected ?? true,
          lastTelemetryMs,
          isAirborne,
        };

        failsafeManager.evaluate(input);
      }
    }, EVAL_INTERVAL_MS);

    return () => clearInterval(interval);
    // Empty deps: effect runs once; refs keep values current.
  }, []);
}

