import { describe, expect, it } from 'vitest';
import {
  createMissionItem,
  createMissionPlan,
  type MissionItem,
  type MissionParams,
  type MissionPlan,
} from '../../domain';
import {
  addMissionPlanItem,
  duplicateMissionPlanItem,
  MissionPlanMutationError,
  removeMissionPlanItem,
  reorderMissionPlanItem,
  updateMissionPlanItem,
  type AddMissionPlanItemInput,
} from '../missionPlanMutations';

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
    params: params(1, 2, 3, 4, 0, 0, 0),
    coordinate: {
      lat,
      lng,
      alt,
    },
  });

const changeSpeed = (id: string, seq: number): MissionItem =>
  createMissionItem({
    id,
    seq,
    command: 'MAV_CMD_DO_CHANGE_SPEED',
    frame: 'MAV_FRAME_MISSION',
    current: false,
    autocontinue: true,
    params: params(1, 12, null, null, null, null, null),
    coordinate: null,
  });

const missionPlan = (items: readonly MissionItem[]): MissionPlan =>
  createMissionPlan({
    id: 'plan-1',
    vehicleType: 'copter',
    home: {
      lat: 40,
      lng: -3,
      alt: 600,
    },
    items,
    updatedAtIso: '2026-06-02T10:00:00.000Z',
  });

describe('missionPlanMutations', () => {
  it('adds an item after the selected row without changing the input plan', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const second = waypoint('item-2', 1, 41, -4, 60);
    const item = waypoint('item-new', 9, 42, -5, 70);
    const plan = missionPlan([first, second]);
    const originalItems = plan.items;

    const nextPlan = addMissionPlanItem({
      plan,
      item,
      afterItemId: 'item-1',
      updatedAtIso: '2026-06-02T11:00:00.000Z',
    });

    expect(nextPlan.items.map((missionItem) => missionItem.id)).toEqual(['item-1', 'item-new', 'item-2']);
    expect(nextPlan.items.map((missionItem) => missionItem.seq)).toEqual([0, 1, 2]);
    expect(nextPlan.updatedAtIso).toBe('2026-06-02T11:00:00.000Z');
    expect(plan.items).toBe(originalItems);
    expect(plan.items.map((missionItem) => missionItem.id)).toEqual(['item-1', 'item-2']);
    expect(item.seq).toBe(9);
  });

  it('adds an item at the end when no selected row is provided', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const second = waypoint('item-2', 1, 41, -4, 60);
    const item = changeSpeed('item-speed', 4);
    const plan = missionPlan([first, second]);

    const nextPlan = addMissionPlanItem({
      plan,
      item,
      afterItemId: null,
      updatedAtIso: '2026-06-02T11:00:00.000Z',
    });

    expect(nextPlan.items.map((missionItem) => missionItem.id)).toEqual([
      'item-1',
      'item-2',
      'item-speed',
    ]);
    expect(nextPlan.items.map((missionItem) => missionItem.seq)).toEqual([0, 1, 2]);
  });

  it('updates params and coordinate through the domain factory', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const plan = missionPlan([first]);
    const coordinate = {
      lat: 42.25,
      lng: -5.75,
      alt: 95,
    };

    const nextPlan = updateMissionPlanItem({
      plan,
      itemId: 'item-1',
      patch: {
        params: params(8, 9, 10, 11, 1, 2, 3),
        coordinate,
      },
      updatedAtIso: '2026-06-02T11:00:00.000Z',
    });

    expect(nextPlan.items[0].params).toEqual([8, 9, 10, 11, 42.25, -5.75, 95]);
    expect(nextPlan.items[0].coordinate).toEqual(coordinate);
    expect(nextPlan.items[0].coordinate).not.toBe(coordinate);
    expect(plan.items[0].coordinate).toEqual({
      lat: 40,
      lng: -3,
      alt: 50,
    });
  });

  it('duplicates the selected item after itself with a new id, sequence, and copied coordinate', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const second = waypoint('item-2', 1, 41, -4, 60);
    const plan = missionPlan([first, second]);

    const nextPlan = duplicateMissionPlanItem({
      plan,
      itemId: 'item-1',
      duplicateId: 'item-copy',
      updatedAtIso: '2026-06-02T11:00:00.000Z',
    });

    expect(nextPlan.items.map((missionItem) => missionItem.id)).toEqual(['item-1', 'item-copy', 'item-2']);
    expect(nextPlan.items.map((missionItem) => missionItem.seq)).toEqual([0, 1, 2]);
    expect(nextPlan.items[1]).toEqual({
      ...nextPlan.items[0],
      id: 'item-copy',
      seq: 1,
    });
    expect(nextPlan.items[1].coordinate).not.toBe(nextPlan.items[0].coordinate);
  });

  it('removes an item and resequences the remaining rows', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const second = waypoint('item-2', 1, 41, -4, 60);
    const third = waypoint('item-3', 2, 42, -5, 70);
    const plan = missionPlan([first, second, third]);

    const nextPlan = removeMissionPlanItem({
      plan,
      itemId: 'item-2',
      updatedAtIso: '2026-06-02T11:00:00.000Z',
    });

    expect(nextPlan.items.map((missionItem) => missionItem.id)).toEqual(['item-1', 'item-3']);
    expect(nextPlan.items.map((missionItem) => missionItem.seq)).toEqual([0, 1]);
    expect(plan.items.map((missionItem) => missionItem.id)).toEqual(['item-1', 'item-2', 'item-3']);
  });

  it('raises a contextual error when add omits afterItemId', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const item = waypoint('item-new', 1, 41, -4, 60);
    const plan = missionPlan([first]);
    const input = {
      plan,
      item,
      updatedAtIso: '2026-06-02T11:00:00.000Z',
    } as unknown as AddMissionPlanItemInput;

    expect(() => addMissionPlanItem(input)).toThrowError(MissionPlanMutationError);
    expect(() => addMissionPlanItem(input)).toThrowError(
      'Mission plan plan-1 add item requires afterItemId; pass null to append',
    );
  });

  it('raises contextual errors when item ids are missing', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const plan = missionPlan([first]);
    const missingItemError = 'Mission item item-missing was not found in mission plan plan-1';

    expect(() =>
      addMissionPlanItem({
        plan,
        item: waypoint('item-new', 1, 41, -4, 60),
        afterItemId: 'item-missing',
        updatedAtIso: '2026-06-02T11:00:00.000Z',
      }),
    ).toThrowError(missingItemError);
    expect(() =>
      updateMissionPlanItem({
        plan,
        itemId: 'item-missing',
        patch: {
          autocontinue: false,
        },
        updatedAtIso: '2026-06-02T11:00:00.000Z',
      }),
    ).toThrowError(missingItemError);
    expect(() =>
      duplicateMissionPlanItem({
        plan,
        itemId: 'item-missing',
        duplicateId: 'item-copy',
        updatedAtIso: '2026-06-02T11:00:00.000Z',
      }),
    ).toThrowError(missingItemError);
    expect(() =>
      removeMissionPlanItem({
        plan,
        itemId: 'item-missing',
        updatedAtIso: '2026-06-02T11:00:00.000Z',
      }),
    ).toThrowError(missingItemError);
  });

  it('reorders an item by index and resequences rows', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const second = waypoint('item-2', 1, 41, -4, 60);
    const third = waypoint('item-3', 2, 42, -5, 70);
    const plan = missionPlan([first, second, third]);

    const nextPlan = reorderMissionPlanItem({
      plan,
      fromIndex: 0,
      toIndex: 2,
      updatedAtIso: '2026-06-02T11:00:00.000Z',
    });

    expect(nextPlan.items.map((missionItem) => missionItem.id)).toEqual(['item-2', 'item-3', 'item-1']);
    expect(nextPlan.items.map((missionItem) => missionItem.seq)).toEqual([0, 1, 2]);
    expect(plan.items.map((missionItem) => missionItem.id)).toEqual(['item-1', 'item-2', 'item-3']);
  });

  it('raises a contextual error for invalid reorder indexes', () => {
    const first = waypoint('item-1', 0, 40, -3, 50);
    const second = waypoint('item-2', 1, 41, -4, 60);
    const plan = missionPlan([first, second]);

    expect(() =>
      reorderMissionPlanItem({
        plan,
        fromIndex: 0,
        toIndex: 2,
        updatedAtIso: '2026-06-02T11:00:00.000Z',
      }),
    ).toThrowError(MissionPlanMutationError);
    expect(() =>
      reorderMissionPlanItem({
        plan,
        fromIndex: 0,
        toIndex: 2,
        updatedAtIso: '2026-06-02T11:00:00.000Z',
      }),
    ).toThrowError('Cannot reorder mission plan plan-1: fromIndex=0, toIndex=2, itemCount=2');
  });
});
