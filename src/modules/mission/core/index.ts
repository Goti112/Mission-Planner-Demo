/**
 * mission/index.ts — Barrel export for the mission engine
 */
export {
  MissionEngine,
  missionEngine,
  MissionPhase,
} from './MissionEngine';

export {
  MissionState,
  MISSION_STATE_TRANSITIONS,
  ACTIVE_FLIGHT_STATES,
  MOVABLE_STATES,
  isValidTransition,
  isActiveFlightState,
  isMovableState,
  MISSION_STATE_LABELS,
  MISSION_STATE_COLORS,
} from './MissionState';

export {
  MissionStateController,
  missionStateController,
} from './MissionStateController';
export type { MissionStateTransition } from './MissionStateController';

export type { MissionProgress } from './MissionProgress';

export {
  MissionProgressCalculator,
  missionProgressCalculator,
} from './MissionProgressCalculator';

export {
  validateMission,
} from './MissionValidator';
export type {
  DroneValidationContext,
  ValidationResult,
} from './MissionValidator';
