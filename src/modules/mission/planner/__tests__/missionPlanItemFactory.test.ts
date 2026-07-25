import { describe, expect, it, vi } from 'vitest';
import type { CreateMissionItemInput, MissionCoordinate, MissionItem } from '../../domain';

const defaultCoordinate = (): MissionCoordinate => ({
  lat: 40.4168,
  lng: -3.7038,
  alt: 80,
});

describe('missionPlanItemFactory', () => {
  it('passes empty default params into NAV_LAND mission items', async () => {
    vi.resetModules();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');

    const createMissionItem = vi.fn((input: CreateMissionItemInput): MissionItem => ({
      id: input.id,
      seq: input.seq,
      command: input.command,
      frame: input.frame,
      current: input.current,
      autocontinue: input.autocontinue,
      params: input.params,
      coordinate: input.coordinate,
    }));

    vi.doMock('../../domain', async () => {
      const actual = await vi.importActual<typeof import('../../domain')>('../../domain');

      return {
        ...actual,
        createMissionItem,
      };
    });

    const { createDefaultMissionItem } = await import('../missionPlanItemFactory');

    createDefaultMissionItem('MAV_CMD_NAV_LAND', 0, defaultCoordinate());

    expect(createMissionItem).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'MAV_CMD_NAV_LAND',
        params: [null, null, null, null, null, null, null],
      }),
    );

    vi.doUnmock('../../domain');
    vi.resetModules();
  });

  it('creates default VTOL mission items with spatial coordinates', async () => {
    vi.resetModules();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('22222222-2222-4222-8222-222222222222');

    const { createDefaultMissionItem } = await import('../missionPlanItemFactory');

    const takeoff = createDefaultMissionItem('MAV_CMD_NAV_VTOL_TAKEOFF', 0, defaultCoordinate());
    const land = createDefaultMissionItem('MAV_CMD_NAV_VTOL_LAND', 1, defaultCoordinate());
    const landStart = createDefaultMissionItem('MAV_CMD_DO_LAND_START', 2, defaultCoordinate());

    expect(takeoff.command).toBe('MAV_CMD_NAV_VTOL_TAKEOFF');
    expect(takeoff.coordinate).toEqual(defaultCoordinate());
    expect(takeoff.params[6]).toBe(80);

    expect(land.command).toBe('MAV_CMD_NAV_VTOL_LAND');
    expect(land.coordinate).toEqual(defaultCoordinate());
    expect(land.params[0]).toBe(0);
    expect(land.params[6]).toBe(80);

    expect(landStart.command).toBe('MAV_CMD_DO_LAND_START');
    expect(landStart.coordinate).toEqual(defaultCoordinate());
    expect(landStart.params[4]).toBe(40.4168);
    expect(landStart.params[5]).toBe(-3.7038);
    expect(landStart.params[6]).toBe(80);

    vi.resetModules();
  });
});
