import type { MissionStatus } from '../../../types/mission';
import type { MissionHome, MissionItem, MissionPlan, MissionVehicleType } from '../domain';
import type {
  AdvancedMissionPlan,
  FenceDefinition,
  RallyPoint,
  SurveyGridSpec,
} from './advancedMissionTypes';

export interface PlannerMissionRecord {
  readonly id: string;
  readonly name: string;
  readonly droneId: string;
  readonly plan: MissionPlan;
  readonly advanced: AdvancedMissionPlan;
  readonly status: MissionStatus;
  readonly currentItemIndex: number;
  readonly progress: number;
  readonly legacyMissionId: string | null;
}

export interface PlannerSelectionState {
  readonly selectedDroneId: string | null;
  readonly selectedMissionId: string | null;
  readonly selectedItemId: string | null;
}

export interface CreateMissionPlanStoreInput {
  readonly name: string;
  readonly droneId: string;
  readonly vehicleType: MissionVehicleType;
  readonly home: MissionHome;
}

export interface MissionPlanStoreState extends PlannerSelectionState {
  readonly missions: Record<string, PlannerMissionRecord>;
  readonly createMission: (input: CreateMissionPlanStoreInput) => string;
  readonly deleteMission: (missionId: string) => void;
  readonly selectDrone: (droneId: string | null) => void;
  readonly selectMission: (missionId: string | null) => void;
  readonly selectItem: (itemId: string | null) => void;
  readonly addItem: (missionId: string, item: MissionItem, afterItemId: string | null) => void;
  readonly updateItem: (
    missionId: string,
    itemId: string,
    patch: Partial<Omit<MissionItem, 'id' | 'seq'>>,
  ) => void;
  readonly updateHome: (missionId: string, home: MissionHome) => void;
  readonly duplicateItem: (missionId: string, itemId: string) => string;
  readonly removeItem: (missionId: string, itemId: string) => void;
  readonly reorderItem: (missionId: string, fromIndex: number, toIndex: number) => void;
  readonly renameMission: (missionId: string, name: string) => void;
  readonly setAdvancedPlan: (missionId: string, advanced: AdvancedMissionPlan) => void;
  readonly addFence: (missionId: string, fence: FenceDefinition) => void;
  readonly updateFence: (
    missionId: string,
    fenceId: string,
    patch: Partial<Omit<FenceDefinition, 'id' | 'shape'>>,
  ) => void;
  readonly removeFence: (missionId: string, fenceId: string) => void;
  readonly addRallyPoint: (missionId: string, rallyPoint: RallyPoint) => void;
  readonly updateRallyPoint: (
    missionId: string,
    rallyPointId: string,
    patch: Partial<Omit<RallyPoint, 'id'>>,
  ) => void;
  readonly removeRallyPoint: (missionId: string, rallyPointId: string) => void;
  readonly addSurvey: (missionId: string, survey: SurveyGridSpec) => void;
  readonly updateSurvey: (
    missionId: string,
    surveyId: string,
    patch: Partial<Omit<SurveyGridSpec, 'id'>>,
  ) => void;
  readonly removeSurvey: (missionId: string, surveyId: string) => void;
  readonly setLegacyMissionId: (missionId: string, legacyMissionId: string) => void;
  readonly setMissionStatus: (
    missionId: string,
    status: MissionStatus,
    currentItemIndex: number,
    progress: number,
  ) => void;
}
