import { useMemo } from 'react';

import type { Drone } from '../../modules/drone';
import {
  type MissionCoordinate,
  type PlannerMissionRecord,
} from '../../modules/mission';
import { DEFAULT_WAYPOINT_ALTITUDE_M } from '../../shared/config/constants';

const DEFAULT_MAP_CENTER: MissionCoordinate = {
  lat: 40.4168,
  lng: -3.7038,
  alt: DEFAULT_WAYPOINT_ALTITUDE_M,
};

export const selectedMissionRecord = (
  missions: Record<string, PlannerMissionRecord>,
  selectedMissionId: string | null,
): PlannerMissionRecord | null => {
  if (selectedMissionId === null) {
    return null;
  }
  return missions[selectedMissionId] ?? null;
};

export type PlanRouteModelInput = {
  readonly dronesObj: Record<string, Drone>;
  readonly plannerSelectedDroneId: string | null;
  readonly plannerSelectedMissionId: string | null;
  readonly plannerMissions: Record<string, PlannerMissionRecord>;
};

export type PlanRouteModel = {
  readonly drones: readonly Drone[];
  readonly activeDrone: Drone | null;
  readonly initialSelectedDroneId: string | null;
  readonly effectiveDroneId: string | null;
  readonly activePlannerDrone: Drone | null;
  readonly selectedMission: PlannerMissionRecord | null;
  readonly droneOptions: readonly { id: string; name: string }[];
  readonly defaultCoordinate: MissionCoordinate;
};

export const usePlanRouteModel = (input: PlanRouteModelInput): PlanRouteModel => {
  const {
    dronesObj,
    plannerSelectedDroneId,
    plannerSelectedMissionId,
    plannerMissions,
  } = input;

  const drones = useMemo(() => Object.values(dronesObj), [dronesObj]);

  const activeDrone = useMemo(
    () => drones.find((drone) => drone.active) ?? drones[0] ?? null,
    [drones],
  );

  const initialSelectedDroneId = activeDrone?.id ?? null;

  const effectiveDroneId = plannerSelectedDroneId ?? initialSelectedDroneId;

  const activePlannerDrone = useMemo(
    () => (effectiveDroneId === null ? null : dronesObj[effectiveDroneId] ?? null),
    [dronesObj, effectiveDroneId],
  );

  const selectedMission = useMemo(
    () => selectedMissionRecord(plannerMissions, plannerSelectedMissionId),
    [plannerMissions, plannerSelectedMissionId],
  );

  const droneOptions = useMemo(
    () => drones.map((drone) => ({ id: drone.id, name: drone.name })),
    [drones],
  );

  const defaultCoordinate: MissionCoordinate = useMemo(
    () => ({
      lat: activePlannerDrone?.lat ?? DEFAULT_MAP_CENTER.lat,
      lng: activePlannerDrone?.lng ?? DEFAULT_MAP_CENTER.lng,
      alt: DEFAULT_WAYPOINT_ALTITUDE_M,
    }),
    [activePlannerDrone],
  );

  return {
    drones,
    activeDrone,
    initialSelectedDroneId,
    effectiveDroneId,
    activePlannerDrone,
    selectedMission,
    droneOptions,
    defaultCoordinate,
  };
};
