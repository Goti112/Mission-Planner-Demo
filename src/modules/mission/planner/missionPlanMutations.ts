import {
  createMissionItem,
  createMissionPlan,
  duplicateMissionItem,
  type MissionItem,
  type MissionPlan,
} from '../domain';

export interface AddMissionPlanItemInput {
  readonly plan: MissionPlan;
  readonly item: MissionItem;
  readonly afterItemId: string | null;
  readonly updatedAtIso: string;
}

export interface UpdateMissionPlanItemInput {
  readonly plan: MissionPlan;
  readonly itemId: string;
  readonly patch: Partial<Omit<MissionItem, 'id' | 'seq'>>;
  readonly updatedAtIso: string;
}

export interface DuplicateMissionPlanItemInput {
  readonly plan: MissionPlan;
  readonly itemId: string;
  readonly duplicateId: string;
  readonly updatedAtIso: string;
}

export interface RemoveMissionPlanItemInput {
  readonly plan: MissionPlan;
  readonly itemId: string;
  readonly updatedAtIso: string;
}

export interface ReorderMissionPlanItemInput {
  readonly plan: MissionPlan;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly updatedAtIso: string;
}

export class MissionPlanMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissionPlanMutationError';
  }
}

const rebuildMissionPlan = (
  plan: MissionPlan,
  items: readonly MissionItem[],
  updatedAtIso: string,
): MissionPlan =>
  createMissionPlan({
    id: plan.id,
    vehicleType: plan.vehicleType,
    home: plan.home,
    items,
    updatedAtIso,
  });

const findMissionItemIndex = (plan: MissionPlan, itemId: string): number => {
  const itemIndex = plan.items.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    throw new MissionPlanMutationError(
      `Mission item ${itemId} was not found in mission plan ${plan.id}`,
    );
  }

  return itemIndex;
};

export const addMissionPlanItem = (input: AddMissionPlanItemInput): MissionPlan => {
  if (input.afterItemId === undefined) {
    throw new MissionPlanMutationError(
      `Mission plan ${input.plan.id} add item requires afterItemId; pass null to append`,
    );
  }

  const insertIndex =
    input.afterItemId === null
      ? input.plan.items.length
      : findMissionItemIndex(input.plan, input.afterItemId) + 1;
  const items = [
    ...input.plan.items.slice(0, insertIndex),
    input.item,
    ...input.plan.items.slice(insertIndex),
  ];

  return rebuildMissionPlan(input.plan, items, input.updatedAtIso);
};

export const updateMissionPlanItem = (input: UpdateMissionPlanItemInput): MissionPlan => {
  findMissionItemIndex(input.plan, input.itemId);

  const items = input.plan.items.map((item): MissionItem => {
    if (item.id !== input.itemId) {
      return item;
    }

    const patchedItem: MissionItem = {
      ...item,
      ...input.patch,
      id: item.id,
      seq: item.seq,
    };

    return createMissionItem(patchedItem);
  });

  return rebuildMissionPlan(input.plan, items, input.updatedAtIso);
};

export const duplicateMissionPlanItem = (input: DuplicateMissionPlanItemInput): MissionPlan => {
  const itemIndex = findMissionItemIndex(input.plan, input.itemId);
  const duplicate = duplicateMissionItem({
    item: input.plan.items[itemIndex],
    id: input.duplicateId,
    seq: itemIndex + 1,
  });
  const items = [
    ...input.plan.items.slice(0, itemIndex + 1),
    duplicate,
    ...input.plan.items.slice(itemIndex + 1),
  ];

  return rebuildMissionPlan(input.plan, items, input.updatedAtIso);
};

export const removeMissionPlanItem = (input: RemoveMissionPlanItemInput): MissionPlan => {
  findMissionItemIndex(input.plan, input.itemId);

  return rebuildMissionPlan(
    input.plan,
    input.plan.items.filter((item) => item.id !== input.itemId),
    input.updatedAtIso,
  );
};

export const reorderMissionPlanItem = (input: ReorderMissionPlanItemInput): MissionPlan => {
  const hasInvalidIndexes =
    input.fromIndex < 0 ||
    input.toIndex < 0 ||
    input.fromIndex >= input.plan.items.length ||
    input.toIndex >= input.plan.items.length;

  if (hasInvalidIndexes) {
    throw new MissionPlanMutationError(
      `Cannot reorder mission plan ${input.plan.id}: fromIndex=${input.fromIndex}, toIndex=${input.toIndex}, itemCount=${input.plan.items.length}`,
    );
  }

  const items = [...input.plan.items];
  const movedItems = items.splice(input.fromIndex, 1);
  const movedItem = movedItems[0];

  if (movedItem === undefined) {
    throw new MissionPlanMutationError(
      `Mission item at index ${input.fromIndex} was not found during reorder in mission plan ${input.plan.id}`,
    );
  }

  items.splice(input.toIndex, 0, movedItem);

  return rebuildMissionPlan(input.plan, items, input.updatedAtIso);
};
