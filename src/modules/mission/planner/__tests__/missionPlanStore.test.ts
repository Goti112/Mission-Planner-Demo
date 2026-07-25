import { beforeEach, describe, expect, it } from 'vitest';
import { createMissionItem, type MissionItem, type MissionParams } from '../../domain';
import { MissionPlanStoreError, useMissionPlanStore } from '../missionPlanStore';

const params = (
  param1: number | null,
  param2: number | null,
  param3: number | null,
  param4: number | null,
  param5: number | null,
  param6: number | null,
  param7: number | null,
): MissionParams => [param1, param2, param3, param4, param5, param6, param7];

const waypoint = (
  id: string,
  seq: number,
  lat: number,
  lng: number,
  alt: number,
): MissionItem =>
  createMissionItem({
    id,
    seq,
    command: 'MAV_CMD_NAV_WAYPOINT',
    frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
    current: false,
    autocontinue: true,
    params: params(0, 0, 0, 0, 0, 0, 0),
    coordinate: {
      lat,
      lng,
      alt,
    },
  });

const createMission = (name: string, droneId: string): string =>
  useMissionPlanStore.getState().createMission({
    name,
    droneId,
    vehicleType: 'copter',
    home: {
      lat: 40.4168,
      lng: -3.7038,
      alt: 60,
    },
  });

beforeEach(() => {
  useMissionPlanStore.setState({
    missions: {},
    selectedDroneId: null,
    selectedMissionId: null,
    selectedItemId: null,
  });
});

describe('missionPlanStore', () => {
  it('creates and selects an empty mission plan record', () => {
    const missionId = createMission('Survey Alpha', 'drone-1');
    const state = useMissionPlanStore.getState();
    const record = state.missions[missionId];

    expect(record).toMatchObject({
      id: missionId,
      name: 'Survey Alpha',
      droneId: 'drone-1',
      status: 'idle',
      currentItemIndex: 0,
      progress: 0,
      legacyMissionId: null,
    });
    expect(record.plan).toMatchObject({
      id: missionId,
      vehicleType: 'copter',
      home: {
        lat: 40.4168,
        lng: -3.7038,
        alt: 60,
      },
      items: [],
    });
    expect(record.plan.updatedAtIso).toEqual(expect.any(String));
    expect(state.selectedDroneId).toBe('drone-1');
    expect(state.selectedMissionId).toBe(missionId);
    expect(state.selectedItemId).toBeNull();
  });

  it('selects the first mission for a drone and clears selections when the drone is null', () => {
    const firstDroneMissionId = createMission('First', 'drone-1');
    createMission('Second', 'drone-1');
    createMission('Other', 'drone-2');

    useMissionPlanStore.getState().selectDrone('drone-1');

    expect(useMissionPlanStore.getState().selectedMissionId).toBe(firstDroneMissionId);

    useMissionPlanStore.getState().selectDrone(null);

    expect(useMissionPlanStore.getState().selectedDroneId).toBeNull();
    expect(useMissionPlanStore.getState().selectedMissionId).toBeNull();
    expect(useMissionPlanStore.getState().selectedItemId).toBeNull();
  });

  it('adds, updates, duplicates, and removes items with predictable selection', () => {
    const missionId = createMission('Survey', 'drone-1');
    const first = waypoint('item-1', 0, 40, -3, 50);

    useMissionPlanStore.getState().addItem(missionId, first, null);

    expect(useMissionPlanStore.getState().selectedItemId).toBe('item-1');

    useMissionPlanStore.getState().updateItem(missionId, 'item-1', {
      coordinate: {
        lat: 41,
        lng: -4,
        alt: 60,
      },
    });

    expect(useMissionPlanStore.getState().missions[missionId].plan.items[0].coordinate).toEqual({
      lat: 41,
      lng: -4,
      alt: 60,
    });

    const duplicateId = useMissionPlanStore.getState().duplicateItem(missionId, 'item-1');

    expect(useMissionPlanStore.getState().selectedItemId).toBe(duplicateId);
    expect(useMissionPlanStore.getState().missions[missionId].plan.items.map((item) => item.id)).toEqual([
      'item-1',
      duplicateId,
    ]);

    useMissionPlanStore.getState().removeItem(missionId, duplicateId);

    expect(useMissionPlanStore.getState().selectedItemId).toBe('item-1');
    expect(useMissionPlanStore.getState().missions[missionId].plan.items.map((item) => item.id)).toEqual([
      'item-1',
    ]);
  });

  it('reorders items and updates sequence order', () => {
    const missionId = createMission('Survey', 'drone-1');

    useMissionPlanStore.getState().addItem(missionId, waypoint('item-1', 0, 40, -3, 50), null);
    useMissionPlanStore.getState().addItem(missionId, waypoint('item-2', 1, 41, -4, 60), null);
    useMissionPlanStore.getState().addItem(missionId, waypoint('item-3', 2, 42, -5, 70), null);
    useMissionPlanStore.getState().reorderItem(missionId, 0, 2);

    const items = useMissionPlanStore.getState().missions[missionId].plan.items;

    expect(items.map((item) => item.id)).toEqual(['item-2', 'item-3', 'item-1']);
    expect(items.map((item) => item.seq)).toEqual([0, 1, 2]);
  });

  it('raises explicit errors for missing mission and item operations', () => {
    const missionId = createMission('Survey', 'drone-1');
    const missingMissionId = 'mission-missing';
    const missingItemId = 'item-missing';
    const missingItemMessage = `Mission item ${missingItemId} was not found in mission ${missionId} in mission plan store.`;

    expect(() => useMissionPlanStore.getState().deleteMission(missingMissionId)).toThrowError(MissionPlanStoreError);
    expect(() => useMissionPlanStore.getState().selectMission(missingMissionId)).toThrowError(MissionPlanStoreError);
    expect(() => useMissionPlanStore.getState().selectItem(missingItemId)).toThrowError(MissionPlanStoreError);
    expect(() =>
      useMissionPlanStore.getState().addItem(missionId, waypoint('item-1', 0, 40, -3, 50), missingItemId),
    ).toThrowError(MissionPlanStoreError);
    expect(() =>
      useMissionPlanStore.getState().addItem(missionId, waypoint('item-1', 0, 40, -3, 50), missingItemId),
    ).toThrowError(missingItemMessage);
    expect(() =>
      useMissionPlanStore.getState().updateItem(missionId, missingItemId, {
        autocontinue: false,
      }),
    ).toThrowError(MissionPlanStoreError);
    expect(() =>
      useMissionPlanStore.getState().updateItem(missionId, missingItemId, {
        autocontinue: false,
      }),
    ).toThrowError(missingItemMessage);
    expect(() => useMissionPlanStore.getState().duplicateItem(missionId, missingItemId)).toThrowError(
      MissionPlanStoreError,
    );
    expect(() => useMissionPlanStore.getState().duplicateItem(missionId, missingItemId)).toThrowError(
      missingItemMessage,
    );
    expect(() => useMissionPlanStore.getState().removeItem(missionId, missingItemId)).toThrowError(
      MissionPlanStoreError,
    );
    expect(() => useMissionPlanStore.getState().removeItem(missionId, missingItemId)).toThrowError(
      missingItemMessage,
    );
    expect(() =>
      useMissionPlanStore.getState().updateHome(missingMissionId, {
        lat: 41,
        lng: -4,
        alt: 60,
      }),
    ).toThrowError(MissionPlanStoreError);
  });

  it('updates mission home without changing selected command item', () => {
    const missionId = createMission('Home Update', 'drone-1');
    const first = waypoint('item-1', 0, 40, -3, 50);

    useMissionPlanStore.getState().addItem(missionId, first, null);
    useMissionPlanStore.getState().updateHome(missionId, {
      lat: 41.25,
      lng: -4.5,
      alt: 60,
    });

    const state = useMissionPlanStore.getState();

    expect(state.missions[missionId].plan.home).toEqual({
      lat: 41.25,
      lng: -4.5,
      alt: 60,
    });
    expect(state.selectedItemId).toBe('item-1');
  });

  it('updates legacy mission id and execution metadata', () => {
    const missionId = createMission('Survey', 'drone-1');

    useMissionPlanStore.getState().setLegacyMissionId(missionId, 'legacy-1');
    useMissionPlanStore.getState().setMissionStatus(missionId, 'running', 2, 0.75);

    expect(useMissionPlanStore.getState().missions[missionId]).toMatchObject({
      legacyMissionId: 'legacy-1',
      status: 'running',
      currentItemIndex: 2,
      progress: 0.75,
    });
  });

  it('stores advanced fence, rally, and survey planning state', () => {
    const missionId = createMission('Advanced', 'drone-1');
    const polygon = [
      { lat: 40.416, lng: -3.704 },
      { lat: 40.416, lng: -3.702 },
      { lat: 40.418, lng: -3.702 },
    ];

    useMissionPlanStore.getState().addFence(missionId, {
      id: 'fence-1',
      name: 'Boundary',
      shape: 'polygon',
      boundary: 'inclusion',
      vertices: polygon,
      minAltitudeM: null,
      maxAltitudeM: 120,
    });
    useMissionPlanStore.getState().addRallyPoint(missionId, {
      id: 'rally-1',
      name: 'Rally',
      coordinate: { lat: 40.419, lng: -3.705, alt: 60 },
      loiterAltitudeM: 80,
      breakAltitudeM: null,
      landHeadingDeg: null,
    });
    useMissionPlanStore.getState().addSurvey(missionId, {
      id: 'survey-1',
      name: 'Grid',
      polygon,
      altitudeM: 60,
      angleDeg: 10,
      laneSpacingM: 35,
      overshootM: 5,
      pattern: 'grid',
      startCorner: 'southWest',
      cameraTriggerMode: 'none',
      cameraTriggerDistanceM: null,
    });

    const advanced = useMissionPlanStore.getState().missions[missionId].advanced;

    expect(advanced.fences).toHaveLength(1);
    expect(advanced.rallyPoints).toHaveLength(1);
    expect(advanced.surveys).toHaveLength(1);

    useMissionPlanStore.getState().removeFence(missionId, 'fence-1');
    useMissionPlanStore.getState().removeRallyPoint(missionId, 'rally-1');
    useMissionPlanStore.getState().removeSurvey(missionId, 'survey-1');

    expect(useMissionPlanStore.getState().missions[missionId].advanced).toEqual({
      fences: [],
      rallyPoints: [],
      surveys: [],
    });
  });
});
