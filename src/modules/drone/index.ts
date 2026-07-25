import type { TelemetryManager, SimulationTelemetrySource } from '../telemetry';
import { DroneMovementMode, droneStateManager } from './core/DroneStateManager';
import { DroneEntity } from './core/DroneEntity';
import { DroneState } from './core/DroneState';
import { useDroneStore } from './store/droneStore';
import type { Drone, DroneMode, DroneUpdate } from './types/drone';
import type {
  DroneMovementMode as DroneMovementModeValue,
  NormalizedDroneState,
} from './core/DroneStateManager';
import type { MissionOverrideState } from '../telemetry';

export { DroneEntity, DroneMovementMode, DroneState, useDroneStore };
export type { DroneOrientation, DronePosition } from './core/DroneEntity';
export type { Drone, DroneMode, DroneUpdate, NormalizedDroneState };

export interface DroneRuntime {
  getActiveDroneId(): string | null;
  updateDrone(id: string, patch: Partial<Drone>): void;
  registerDrone(droneId: string, homeLat: number, homeLon: number, homeAltMSL: number): void;
  unregisterDrone(droneId: string): void;
  getRegisteredIds(): string[];
  isRegistered(droneId: string): boolean;
  selectDrone(droneId: string | null): void;
  getSelectedDroneId(): string | null;
  getManager(droneId: string): TelemetryManager | null;
  getSelectedManager(): TelemetryManager | null;
  getDroneState(droneId: string): NormalizedDroneState | null;
  getSelectedDroneState(): NormalizedDroneState | null;
  getMovementMode(droneId: string): DroneMovementModeValue;
  setMovementMode(droneId: string, mode: DroneMovementModeValue): void;
  pushMissionState(droneId: string, state: MissionOverrideState): void;
  clearMissionState(droneId: string): void;
  resetInterpolator(droneId: string): void;
  getSource(droneId: string): SimulationTelemetrySource | null;
  getHomePosition(droneId: string): { lat: number; lon: number; altMSL: number } | null;
  setSimSource(droneId: string, source: SimulationTelemetrySource): void;
  setSimulationArmState(droneId: string, armed: boolean): void;
}

function getActiveDroneId(): string | null {
  const drones = useDroneStore.getState().drones;
  return Object.values(drones).find((drone) => drone.active)?.id ?? null;
}

export const droneRuntime: DroneRuntime = {
  getActiveDroneId,
  updateDrone(id, patch) {
    useDroneStore.getState().updateDrone(id, patch);
  },
  registerDrone(droneId, homeLat, homeLon, homeAltMSL) {
    droneStateManager.registerDrone(droneId, homeLat, homeLon, homeAltMSL);
  },
  unregisterDrone(droneId) {
    droneStateManager.unregisterDrone(droneId);
  },
  getRegisteredIds() {
    return droneStateManager.getRegisteredIds();
  },
  isRegistered(droneId) {
    return droneStateManager.isRegistered(droneId);
  },
  selectDrone(droneId) {
    droneStateManager.selectDrone(droneId);
  },
  getSelectedDroneId() {
    return droneStateManager.selectedDroneId;
  },
  getManager(droneId) {
    return droneStateManager.getManager(droneId);
  },
  getSelectedManager() {
    return droneStateManager.getSelectedManager();
  },
  getDroneState(droneId) {
    return droneStateManager.getDroneState(droneId);
  },
  getSelectedDroneState() {
    return droneStateManager.getSelectedDroneState();
  },
  getMovementMode(droneId) {
    return droneStateManager.getMovementMode(droneId);
  },
  setMovementMode(droneId, mode) {
    droneStateManager.setMovementMode(droneId, mode);
  },
  pushMissionState(droneId, state) {
    droneStateManager.pushMissionState(droneId, state);
  },
  clearMissionState(droneId) {
    droneStateManager.clearMissionState(droneId);
  },
  resetInterpolator(droneId) {
    droneStateManager.resetInterpolator(droneId);
  },
  getSource(droneId) {
    return droneStateManager.getSource(droneId);
  },
  getHomePosition(droneId) {
    return droneStateManager.getHomePosition(droneId);
  },
  setSimSource(droneId, source) {
    droneStateManager.setSimSource(droneId, source);
  },
  setSimulationArmState(droneId, armed) {
    droneStateManager.setSimulationArmState(droneId, armed);
  },
};
