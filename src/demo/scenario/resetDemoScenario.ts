import { DroneState, type Drone, useDroneStore } from '../../modules/drone';
import {
  MissionState,
  droneMissionController,
  useMissionPlanStore,
  useMissionStore,
} from '../../modules/mission';
import { useFlightEventStore } from '../../modules/mission/store/flightEventStore';
import { useMissionProgressStore } from '../../modules/mission/store/missionProgressStore';
import { useFlightRecorderStore } from '../../modules/replay/store';
import { useReplayImportStore } from '../../modules/replay/store/replayImportStore';
import { useReplayTrajectoryStore } from '../../modules/replay/store/replayTrajectoryStore';
import { useUIStore } from '../../shared/store/uiStore';
import { DEMO_DRONE_ID, DEMO_HOME, DEMO_MISSION_ID, createDemoMissionRecord } from './demoMission';

const createDemoDrone = (): Drone => ({
  id: DEMO_DRONE_ID,
  name: 'AllDrone 440-A',
  active: true,
  lat: DEMO_HOME.lat,
  lng: DEMO_HOME.lng,
  altitude: DEMO_HOME.alt,
  yaw: 0,
  pitch: 0,
  roll: 0,
  battery: 100,
  airspeed: 0,
  groundspeed: 0,
  mode: 'MANUAL',
  missionState: DroneState.IDLE,
  missionLifecycleState: MissionState.IDLE,
});

export class DemoScenarioResetError extends Error {
  constructor(cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);

    super(`Failed to reset the demo scenario: ${causeMessage}`, { cause });
    this.name = 'DemoScenarioResetError';
  }
}

export const resetDemoScenario = (): void => {
  try {
    droneMissionController.resetRuntimeToIdle();
    const mission = createDemoMissionRecord();

    useFlightRecorderStore.getState().stopRecording();
    useFlightRecorderStore.setState({
      recordings: {},
      isRecording: false,
      _pendingMissionName: 'Grabación',
      replayState: 'IDLE',
      replayDroneId: null,
      replayIndex: 0,
      replaySpeed: 1,
    });
    useReplayImportStore.getState().resetImport();
    useReplayTrajectoryStore.getState().clear();
    useMissionStore.setState({ missions: {} });
    useMissionProgressStore.getState().clearAll();
    useFlightEventStore.getState().clearAll();
    useMissionPlanStore.setState({
      missions: { [DEMO_MISSION_ID]: mission },
      selectedDroneId: DEMO_DRONE_ID,
      selectedMissionId: DEMO_MISSION_ID,
      selectedItemId: null,
    });
    useDroneStore.setState({
      drones: { [DEMO_DRONE_ID]: createDemoDrone() },
    });
    useUIStore.setState({ currentView: 'PLAN', show3D: false });
    droneMissionController.syncEntitiesWithStore();
  } catch (error: unknown) {
    throw new DemoScenarioResetError(error);
  }
};
