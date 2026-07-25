import {
  createMissionPlan,
  resequenceMissionItems,
  type MissionCoordinate,
  type MissionHome,
  type MissionItem,
  type MissionPlan,
} from '../domain';

export interface NormalizeMissionPlanHomeInput {
  readonly plan: MissionPlan;
  readonly updatedAtIso: string;
}

export interface ReplaceMissionPlanItemsWithHomePromotionInput {
  readonly plan: MissionPlan;
  readonly items: readonly MissionItem[];
  readonly updatedAtIso: string;
}

export interface NormalizeMissionPlanHomeResult {
  readonly plan: MissionPlan;
  readonly promotedItemId: string | null;
}

export interface PromoteMissionItemsToHomeInput {
  readonly items: readonly MissionItem[];
}

export interface PromoteMissionItemsToHomeResult {
  readonly home: MissionHome | null;
  readonly items: readonly MissionItem[];
  readonly promotedItemId: string | null;
}

export class MissionPlanHomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissionPlanHomeError';
  }
}

const assertHomeCoordinate = (home: MissionHome): void => {
  if (!Number.isFinite(home.lat) || home.lat < -90 || home.lat > 90) {
    throw new MissionPlanHomeError(
      `Mission HOME latitude must be finite and between -90 and 90 degrees; lat=${home.lat.toString()}.`,
    );
  }

  if (!Number.isFinite(home.lng) || home.lng < -180 || home.lng > 180) {
    throw new MissionPlanHomeError(
      `Mission HOME longitude must be finite and between -180 and 180 degrees; lng=${home.lng.toString()}.`,
    );
  }

  if (!Number.isFinite(home.alt) || home.alt < 0) {
    throw new MissionPlanHomeError(
      `Mission HOME altitude must be finite and greater than or equal to 0; alt=${home.alt.toString()}.`,
    );
  }
};

export const toMissionHome = (coordinate: MissionCoordinate | MissionHome): MissionHome => {
  const home: MissionHome = {
    lat: coordinate.lat,
    lng: coordinate.lng,
    alt: coordinate.alt,
  };

  assertHomeCoordinate(home);

  return home;
};

const rebuildPlan = (
  plan: MissionPlan,
  home: MissionHome | null,
  items: readonly MissionItem[],
  updatedAtIso: string,
): MissionPlan =>
  createMissionPlan({
    id: plan.id,
    vehicleType: plan.vehicleType,
    home,
    items,
    updatedAtIso,
  });

const findFirstSpatialItem = (items: readonly MissionItem[]): MissionItem | null =>
  items.find((item) => item.coordinate !== null) ?? null;

export const normalizeMissionPlanHome = (
  input: NormalizeMissionPlanHomeInput,
): NormalizeMissionPlanHomeResult => {
  if (input.plan.home !== null) {
    assertHomeCoordinate(input.plan.home);

    return {
      plan: input.plan,
      promotedItemId: null,
    };
  }

  const homeItem = findFirstSpatialItem(input.plan.items);

  if (homeItem === null || homeItem.coordinate === null) {
    return {
      plan: input.plan,
      promotedItemId: null,
    };
  }

  const home = toMissionHome(homeItem.coordinate);
  const items = input.plan.items.filter((item) => item.id !== homeItem.id);

  return {
    plan: rebuildPlan(input.plan, home, items, input.updatedAtIso),
    promotedItemId: homeItem.id,
  };
};

export const promoteMissionItemsToHome = (
  input: PromoteMissionItemsToHomeInput,
): PromoteMissionItemsToHomeResult => {
  const homeItem = findFirstSpatialItem(input.items);

  if (homeItem === null || homeItem.coordinate === null) {
    return {
      home: null,
      items: input.items,
      promotedItemId: null,
    };
  }

  return {
    home: toMissionHome(homeItem.coordinate),
    items: resequenceMissionItems(input.items.filter((item) => item.id !== homeItem.id)),
    promotedItemId: homeItem.id,
  };
};

export const replaceMissionPlanItemsWithHomePromotion = (
  input: ReplaceMissionPlanItemsWithHomePromotionInput,
): NormalizeMissionPlanHomeResult => {
  const plan = rebuildPlan(input.plan, input.plan.home, input.items, input.updatedAtIso);

  return normalizeMissionPlanHome({
    plan,
    updatedAtIso: input.updatedAtIso,
  });
};
