import { create } from 'zustand';
import type { MissionStatus } from '../../../types/mission';
import { createMissionPlan, type MissionHome, type MissionItem, type MissionPlan } from '../domain';
import { toMissionHome } from './missionPlanHome';
import { emptyAdvancedMissionPlan } from './advancedMissionTypes';
import {
  addFence,
  addRallyPoint,
  addSurvey,
  removeFence,
  removeRallyPoint,
  removeSurvey,
  updateFence,
  updateRallyPoint,
  updateSurvey,
} from './advancedMissionMutations';
import {
  addMissionPlanItem,
  duplicateMissionPlanItem,
  removeMissionPlanItem,
  reorderMissionPlanItem,
  updateMissionPlanItem,
} from './missionPlanMutations';
import type {
  CreateMissionPlanStoreInput,
  MissionPlanStoreState,
  PlannerMissionRecord,
} from './types';

export class MissionPlanStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissionPlanStoreError';
  }
}

let localIdSequence = 0;

const createLocalId = (scope: string): string => {
  localIdSequence += 1;
  return `${scope}-${localIdSequence.toString(36)}`;
};

const nowIso = (): string => new Date().toISOString();

const createMissingMissionError = (missionId: string): MissionPlanStoreError =>
  new MissionPlanStoreError(`Mission ${missionId} was not found in mission plan store.`);

const createMissingSelectedMissionError = (itemId: string): MissionPlanStoreError =>
  new MissionPlanStoreError(`Cannot select item ${itemId} because no mission is selected.`);

const createMissingSelectedItemError = (missionId: string, itemId: string): MissionPlanStoreError =>
  new MissionPlanStoreError(`Mission item ${itemId} was not found in selected mission ${missionId}.`);

const createMissingMissionItemError = (missionId: string, itemId: string): MissionPlanStoreError =>
  new MissionPlanStoreError(
    `Mission item ${itemId} was not found in mission ${missionId} in mission plan store.`,
  );

const findMissionRecord = (
  missions: Record<string, PlannerMissionRecord>,
  missionId: string,
): PlannerMissionRecord => {
  const mission = missions[missionId];

  if (mission === undefined) {
    throw createMissingMissionError(missionId);
  }

  return mission;
};

const patchMissionRecord = (
  missions: Record<string, PlannerMissionRecord>,
  missionId: string,
  patch: Partial<PlannerMissionRecord>,
): Record<string, PlannerMissionRecord> => {
  const mission = findMissionRecord(missions, missionId);

  return {
    ...missions,
    [missionId]: {
      ...mission,
      ...patch,
    },
  };
};

const findFirstMissionIdForDrone = (
  missions: Record<string, PlannerMissionRecord>,
  droneId: string,
): string | null => {
  const mission = Object.values(missions).find((record) => record.droneId === droneId);

  return mission === undefined ? null : mission.id;
};

const hasMissionItem = (plan: MissionPlan, itemId: string): boolean =>
  plan.items.some((item) => item.id === itemId);

const assertMissionItemExists = (mission: PlannerMissionRecord, itemId: string): void => {
  if (!hasMissionItem(mission.plan, itemId)) {
    throw createMissingMissionItemError(mission.id, itemId);
  }
};

const selectNearestItemAfterRemoval = (
  previousPlan: MissionPlan,
  nextPlan: MissionPlan,
  removedItemId: string,
): string | null => {
  const removedIndex = previousPlan.items.findIndex((item) => item.id === removedItemId);

  if (removedIndex === -1) {
    return null;
  }

  const nearestItem = nextPlan.items[Math.min(removedIndex, nextPlan.items.length - 1)];

  return nearestItem === undefined ? null : nearestItem.id;
};

const updateMissionPlanHome = (
  plan: MissionPlan,
  home: MissionHome,
  updatedAtIso: string,
): MissionPlan =>
  createMissionPlan({
    id: plan.id,
    vehicleType: plan.vehicleType,
    home: toMissionHome(home),
    items: plan.items,
    updatedAtIso,
  });

export const useMissionPlanStore = create<MissionPlanStoreState>((set) => ({
  missions: {},
  selectedDroneId: null,
  selectedMissionId: null,
  selectedItemId: null,

  createMission: (input: CreateMissionPlanStoreInput): string => {
    const missionId = createLocalId('planner-mission');
    const updatedAtIso = nowIso();
    const plan = createMissionPlan({
      id: missionId,
      vehicleType: input.vehicleType,
      home: toMissionHome(input.home),
      items: [],
      updatedAtIso,
    });
    const record: PlannerMissionRecord = {
      id: missionId,
      name: input.name,
      droneId: input.droneId,
      plan,
      advanced: emptyAdvancedMissionPlan(),
      status: 'idle',
      currentItemIndex: 0,
      progress: 0,
      legacyMissionId: null,
    };

    set((state) => ({
      missions: {
        ...state.missions,
        [missionId]: record,
      },
      selectedDroneId: input.droneId,
      selectedMissionId: missionId,
      selectedItemId: null,
    }));

    return missionId;
  },

  deleteMission: (missionId: string): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);
      const missions = { ...state.missions };
      delete missions[missionId];

      if (state.selectedMissionId !== missionId) {
        return {
          missions,
        };
      }

      const selectedMissionId = findFirstMissionIdForDrone(missions, mission.droneId);

      return {
        missions,
        selectedMissionId,
        selectedItemId: null,
      };
    });
  },

  selectDrone: (droneId: string | null): void => {
    set((state) => {
      if (droneId === null) {
        return {
          selectedDroneId: null,
          selectedMissionId: null,
          selectedItemId: null,
        };
      }

      const selectedMission =
        state.selectedMissionId === null ? undefined : state.missions[state.selectedMissionId];

      if (selectedMission !== undefined && selectedMission.droneId === droneId) {
        return {
          selectedDroneId: droneId,
        };
      }

      return {
        selectedDroneId: droneId,
        selectedMissionId: findFirstMissionIdForDrone(state.missions, droneId),
        selectedItemId: null,
      };
    });
  },

  selectMission: (missionId: string | null): void => {
    set((state) => {
      if (missionId === null) {
        return {
          selectedMissionId: null,
          selectedItemId: null,
        };
      }

      const mission = findMissionRecord(state.missions, missionId);
      const selectedItemId =
        state.selectedItemId !== null && hasMissionItem(mission.plan, state.selectedItemId)
          ? state.selectedItemId
          : null;

      return {
        selectedDroneId: mission.droneId,
        selectedMissionId: missionId,
        selectedItemId,
      };
    });
  },

  selectItem: (itemId: string | null): void => {
    set((state) => {
      if (itemId === null) {
        return {
          selectedItemId: null,
        };
      }

      if (state.selectedMissionId === null) {
        throw createMissingSelectedMissionError(itemId);
      }

      const mission = findMissionRecord(state.missions, state.selectedMissionId);

      if (!hasMissionItem(mission.plan, itemId)) {
        throw createMissingSelectedItemError(mission.id, itemId);
      }

      return {
        selectedItemId: itemId,
      };
    });
  },

  addItem: (missionId: string, item: MissionItem, afterItemId: string | null): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      if (afterItemId !== null) {
        assertMissionItemExists(mission, afterItemId);
      }

      const plan = addMissionPlanItem({
        plan: mission.plan,
        item,
        afterItemId,
        updatedAtIso: nowIso(),
      });

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          plan,
        }),
        selectedDroneId: mission.droneId,
        selectedMissionId: missionId,
        selectedItemId: item.id,
      };
    });
  },

  updateItem: (
    missionId: string,
    itemId: string,
    patch: Partial<Omit<MissionItem, 'id' | 'seq'>>,
  ): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);
      assertMissionItemExists(mission, itemId);

      const plan = updateMissionPlanItem({
        plan: mission.plan,
        itemId,
        patch,
        updatedAtIso: nowIso(),
      });

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          plan,
        }),
      };
    });
  },

  updateHome: (missionId: string, home: MissionHome): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);
      const plan = updateMissionPlanHome(mission.plan, home, nowIso());

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          plan,
        }),
      };
    });
  },

  duplicateItem: (missionId: string, itemId: string): string => {
    const currentMission = findMissionRecord(useMissionPlanStore.getState().missions, missionId);
    assertMissionItemExists(currentMission, itemId);
    const duplicateId = createLocalId('planner-item');

    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);
      assertMissionItemExists(mission, itemId);
      const plan = duplicateMissionPlanItem({
        plan: mission.plan,
        itemId,
        duplicateId,
        updatedAtIso: nowIso(),
      });

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          plan,
        }),
        selectedDroneId: mission.droneId,
        selectedMissionId: missionId,
        selectedItemId: duplicateId,
      };
    });

    return duplicateId;
  },

  removeItem: (missionId: string, itemId: string): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);
      assertMissionItemExists(mission, itemId);

      const plan = removeMissionPlanItem({
        plan: mission.plan,
        itemId,
        updatedAtIso: nowIso(),
      });
      const isSelectedItemRemoved = state.selectedMissionId === missionId && state.selectedItemId === itemId;

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          plan,
        }),
        selectedItemId: isSelectedItemRemoved
          ? selectNearestItemAfterRemoval(mission.plan, plan, itemId)
          : state.selectedItemId,
      };
    });
  },

  reorderItem: (missionId: string, fromIndex: number, toIndex: number): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);
      const plan = reorderMissionPlanItem({
        plan: mission.plan,
        fromIndex,
        toIndex,
        updatedAtIso: nowIso(),
      });

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          plan,
        }),
      };
    });
  },

  renameMission: (missionId: string, name: string): void => {
    set((state) => ({
      missions: patchMissionRecord(state.missions, missionId, {
        name,
      }),
    }));
  },

  setAdvancedPlan: (missionId, advanced): void => {
    set((state) => ({
      missions: patchMissionRecord(state.missions, missionId, {
        advanced,
      }),
    }));
  },

  addFence: (missionId, fence): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: addFence(mission.advanced, fence),
        }),
      };
    });
  },

  updateFence: (missionId, fenceId, patch): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: updateFence(mission.advanced, fenceId, patch),
        }),
      };
    });
  },

  removeFence: (missionId, fenceId): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: removeFence(mission.advanced, fenceId),
        }),
      };
    });
  },

  addRallyPoint: (missionId, rallyPoint): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: addRallyPoint(mission.advanced, rallyPoint),
        }),
      };
    });
  },

  updateRallyPoint: (missionId, rallyPointId, patch): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: updateRallyPoint(mission.advanced, rallyPointId, patch),
        }),
      };
    });
  },

  removeRallyPoint: (missionId, rallyPointId): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: removeRallyPoint(mission.advanced, rallyPointId),
        }),
      };
    });
  },

  addSurvey: (missionId, survey): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: addSurvey(mission.advanced, survey),
        }),
      };
    });
  },

  updateSurvey: (missionId, surveyId, patch): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: updateSurvey(mission.advanced, surveyId, patch),
        }),
      };
    });
  },

  removeSurvey: (missionId, surveyId): void => {
    set((state) => {
      const mission = findMissionRecord(state.missions, missionId);

      return {
        missions: patchMissionRecord(state.missions, missionId, {
          advanced: removeSurvey(mission.advanced, surveyId),
        }),
      };
    });
  },

  setLegacyMissionId: (missionId: string, legacyMissionId: string): void => {
    set((state) => ({
      missions: patchMissionRecord(state.missions, missionId, {
        legacyMissionId,
      }),
    }));
  },

  setMissionStatus: (
    missionId: string,
    status: MissionStatus,
    currentItemIndex: number,
    progress: number,
  ): void => {
    set((state) => ({
      missions: patchMissionRecord(state.missions, missionId, {
        status,
        currentItemIndex,
        progress,
      }),
    }));
  },
}));
