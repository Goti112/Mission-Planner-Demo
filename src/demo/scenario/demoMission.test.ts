import { describe, expect, it } from 'vitest';
import { createDemoMissionRecord } from './demoMission';

describe('createDemoMissionRecord', () => {
  it('creates the ordered Synthetic Range Alpha mission without sharing mutable mission data', () => {
    const firstMission = createDemoMissionRecord();
    const secondMission = createDemoMissionRecord();

    expect(firstMission.id).toBe('demo-mission');
    expect(firstMission.droneId).toBe('drone-1');
    expect(firstMission.name).toBe('Synthetic Range Alpha');
    expect(firstMission.plan.items).toHaveLength(6);
    expect(firstMission.plan.items.map((item) => item.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(firstMission.plan.items[0]?.command).toBe('MAV_CMD_NAV_TAKEOFF');
    expect(firstMission.plan.items[5]?.command).toBe('MAV_CMD_NAV_LAND');
    expect(firstMission.plan.items).not.toBe(secondMission.plan.items);
    expect(firstMission.plan.items[0]).not.toBe(secondMission.plan.items[0]);
    expect(firstMission.plan.items[0]?.coordinate).not.toBe(secondMission.plan.items[0]?.coordinate);
  });
});
