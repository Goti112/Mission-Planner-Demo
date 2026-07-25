/**
 * useDroneTelemetry.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * PER-DRONE TELEMETRY HOOK — replaces the old global useSimulationTelemetry
 * ════════════════════════════════════════════════════════════════════════
 *
 * Lifecycle:
 *   1. On mount: registers all drones from droneStore in DroneStateManager.
 *   2. Subscribes to droneStore — registers/unregisters as drones are added/removed.
 *   3. Tracks selectedDroneId (= active drone in store).
 *   4. Returns telemetry for the SELECTED drone only.
 *   5. On unmount: unregisters all drones and cleans up.
 *
 * PFD reads from snapshotProvider (= selectedDrone's TelemetryManager).
 * Panel reads from normTelemetry (= selectedDrone's NormalizedTelemetry).
 * 3D/Map reads from droneStore (auto-synced by DroneStateManager).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  droneRuntime,
  DroneMovementMode,
  type NormalizedDroneState,
  useDroneStore,
} from '../../drone';
import {
  DEFAULT_FLIGHT_TELEMETRY,
} from '../core/FlightTelemetryModel';
import type {
  FlightTelemetry,
  NormalizedTelemetry,
} from '../core/FlightTelemetryModel';
import type { SnapshotProvider } from '../core/SnapshotProvider';
import { PFDInterpolationBuffer, SIK_RADIO_PFD_CONFIG } from '../core/PFDInterpolationBuffer';
import { InertiaSmoother } from '../core/InertiaSmoother';

// ── Approximate home MSL altitude by city (simple lookup) ─────────────────
// In production this would come from terrain service or GPS first-fix.
function estimateHomeMSL(lat: number): number {
  // Madrid area
  if (lat > 40 && lat < 41) return 650;
  // Tenerife area
  if (lat > 28 && lat < 29) return 520;
  // Default
  return 100;
}

// ── Result interface ──────────────────────────────────────────────────────

export interface UseDroneTelemetryResult {
  /** Current telemetry as React state for the SELECTED drone. */
  telemetry: FlightTelemetry;
  /** NormalizedTelemetry for the selected drone. Null until first packet or no selection. */
  normTelemetry: NormalizedTelemetry | null;
  /** Hard-reset the selected drone's pipeline. */
  resetTelemetry: () => void;
  /** SnapshotProvider for PFD rAF loop — reads from selected drone's manager. */
  snapshotProvider: React.RefObject<SnapshotProvider | null>;
  /** NormalizedDroneState for selected drone (position/attitude/velocity). */
  droneState: NormalizedDroneState | null;
  /** Currently selected drone ID. */
  selectedDroneId: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useDroneTelemetry(): UseDroneTelemetryResult {
  // Derive selectedDroneId from store directly (no local state needed)
  const activeDroneId = useDroneStore(
    (s) => Object.values(s.drones).find(d => d.active)?.id ?? null,
  );

  const [telemetry, setTelemetry] = useState<FlightTelemetry>(DEFAULT_FLIGHT_TELEMETRY);
  const [normTelemetry, setNormTelemetry] = useState<NormalizedTelemetry | null>(null);
  const [droneState, setDroneState] = useState<NormalizedDroneState | null>(null);

  // Snapshot provider ref — points to selected drone's TelemetryManager
  const snapshotProviderRef = useRef<SnapshotProvider | null>(null);

  // Track active subscriptions for selected drone
  const selectedUnsubsRef = useRef<(() => void)[]>([]);

  // ── Register all initial drones + subscribe to store changes ──────────
  useEffect(() => {
    const mgr = droneRuntime;

    // Register all existing drones
    const initialDrones = useDroneStore.getState().drones;
    for (const drone of Object.values(initialDrones)) {
      if (!mgr.isRegistered(drone.id)) {
        const homeMSL = estimateHomeMSL(drone.lat);
        mgr.registerDrone(drone.id, drone.lat, drone.lng, homeMSL);
        mgr.setMovementMode(drone.id, DroneMovementMode.IDLE);
      }
    }

    // Subscribe to store changes for drone add/remove
    const unsubStore = useDroneStore.subscribe((state) => {
      const currentDrones = state.drones;

      // Register new drones
      for (const drone of Object.values(currentDrones)) {
        if (!mgr.isRegistered(drone.id)) {
          const homeMSL = estimateHomeMSL(drone.lat);
          mgr.registerDrone(drone.id, drone.lat, drone.lng, homeMSL);
          mgr.setMovementMode(drone.id, DroneMovementMode.IDLE);
        }
      }

      // Unregister removed drones
      for (const id of mgr.getRegisteredIds()) {
        if (!currentDrones[id]) {
          mgr.unregisterDrone(id);
        }
      }
    });

    return () => {
      unsubStore();
      // Unregister all drones on unmount
      for (const id of mgr.getRegisteredIds()) {
        mgr.unregisterDrone(id);
      }
    };
  }, []);

  // ── Sync selection to DroneStateManager + bind telemetry streams ──────
  useEffect(() => {
    const mgr = droneRuntime;
    mgr.selectDrone(activeDroneId);

    // Clean up previous subscriptions
    for (const unsub of selectedUnsubsRef.current) unsub();
    selectedUnsubsRef.current = [];

    if (!activeDroneId) {
      snapshotProviderRef.current = null;
      return;
    }

    const manager = mgr.getManager(activeDroneId);
    if (!manager) {
      snapshotProviderRef.current = null;
      return;
    }

    // Wire PFD interpolation buffer as snapshot provider.
    // SIK_RADIO_PFD_CONFIG uses renderDelayMs=300ms (> max inter-sample interval)
    // and maxGapMs=2000ms (> normal SiK burst gaps of 500-760ms observed in flight).
    const pfdBuffer = new PFDInterpolationBuffer(SIK_RADIO_PFD_CONFIG);
    const inertiaSmoother = new InertiaSmoother(pfdBuffer);
    const unsubRawNorm = manager.onRawNormalized((normalized) => {
      pfdBuffer.pushSample(normalized, performance.now());
    });
    snapshotProviderRef.current = inertiaSmoother;

    // Subscribe to telemetry for React state (HTML indicators)
    const unsubTel = manager.onTelemetry((data) => {
      setTelemetry(data);
      // Also update droneState snapshot
      const ds = mgr.getDroneState(activeDroneId);
      if (ds) setDroneState({ ...ds });
    });

    // Subscribe to normalized telemetry for panel
    const unsubNorm = manager.onNormTelemetry((data) => {
      setNormTelemetry(data);
    });

    selectedUnsubsRef.current = [unsubTel, unsubNorm, unsubRawNorm];

    return () => {
      for (const unsub of selectedUnsubsRef.current) unsub();
      selectedUnsubsRef.current = [];
      pfdBuffer.reset();
      inertiaSmoother.reset();
      snapshotProviderRef.current = null;
    };
  }, [activeDroneId]);

  // ── Reset ─────────────────────────────────────────────────────────────
  const resetTelemetry = useCallback(() => {
    if (activeDroneId) {
      droneRuntime.getManager(activeDroneId)?.reset();
    }
    setTelemetry(DEFAULT_FLIGHT_TELEMETRY);
    setNormTelemetry(null);
    setDroneState(null);
  }, [activeDroneId]);

  return {
    telemetry,
    normTelemetry,
    resetTelemetry,
    snapshotProvider: snapshotProviderRef,
    droneState,
    selectedDroneId: activeDroneId,
  };
}
