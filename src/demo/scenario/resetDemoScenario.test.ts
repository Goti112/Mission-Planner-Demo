import { describe, expect, it } from 'vitest';
import { useDroneStore } from '../../modules/drone';
import { useMissionPlanStore, useMissionStore } from '../../modules/mission';
import { useFlightRecorderStore } from '../../modules/replay/store';
import { useUIStore } from '../../shared/store/uiStore';
import { DEMO_HOME, DEMO_MISSION_ID, createDemoMissionRecord } from './demoMission';
import { resetDemoScenario } from './resetDemoScenario';

describe('resetDemoScenario', () => {
  it('restores the synthetic mission, grounded active drone, and clean replay and UI state', () => {
    const dirtyMission = {
      ...createDemoMissionRecord(),
      id: 'legacy-planner-mission',
      name: 'Dirty mission',
    };
    const drone = useDroneStore.getState().drones['drone-1'];

    if (drone === undefined) {
      throw new Error('Expected the baseline simulation drone to exist.');
    }

    useMissionPlanStore.setState({
      missions: { [dirtyMission.id]: dirtyMission },
      selectedDroneId: 'legacy-drone',
      selectedMissionId: dirtyMission.id,
      selectedItemId: 'demo-waypoint-2',
    });
    useMissionStore.getState().createMission('Legacy mission', 'drone-1');
    useFlightRecorderStore.getState().startRecording('Dirty recording');
    useFlightRecorderStore.getState().injectMockRecording('drone-1', 1, 1);
    useFlightRecorderStore.getState().startReplay('drone-1');
    useUIStore.setState({ currentView: 'REPLAY', show3D: true });
    useDroneStore.setState({
      drones: {
        'drone-1': {
          ...drone,
          active: false,
          lat: 1,
          lng: 1,
          altitude: 200,
        },
      },
    });

    resetDemoScenario();

    const missionPlanState = useMissionPlanStore.getState();
    const recorderState = useFlightRecorderStore.getState();
    const uiState = useUIStore.getState();
    const resetDrone = useDroneStore.getState().drones['drone-1'];

    expect(Object.keys(missionPlanState.missions)).toEqual([DEMO_MISSION_ID]);
    expect(missionPlanState.selectedDroneId).toBe('drone-1');
    expect(missionPlanState.selectedMissionId).toBe(DEMO_MISSION_ID);
    expect(missionPlanState.selectedItemId).toBeNull();
    expect(useMissionStore.getState().missions).toEqual({});
    expect(recorderState.recordings).toEqual({});
    expect(recorderState.replayState).toBe('IDLE');
    expect(uiState.currentView).toBe('PLAN');
    expect(uiState.show3D).toBe(false);
    expect(resetDrone).toMatchObject({
      id: 'drone-1',
      active: true,
      lat: DEMO_HOME.lat,
      lng: DEMO_HOME.lng,
      altitude: DEMO_HOME.alt,
    });
  });
});
