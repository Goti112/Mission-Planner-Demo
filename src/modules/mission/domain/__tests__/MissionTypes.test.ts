import { describe, expect, it } from 'vitest';
import {
  MISSION_COMMANDS,
  MISSION_FRAMES,
  VEHICLE_TYPES,
  type MissionCommand,
  type MissionFrame,
  type MissionParams,
  type MissionVehicleType,
} from '../MissionTypes';

describe('MissionTypes', () => {
  it('exposes stable command, frame, vehicle, and param contracts', () => {
    const command: MissionCommand = 'MAV_CMD_NAV_WAYPOINT';
    const frame: MissionFrame = 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT';
    const vehicleType: MissionVehicleType = 'copter';
    const params: MissionParams = [0, 0, null, null, 40.4168, -3.7038, 60];

    expect(command).toBe('MAV_CMD_NAV_WAYPOINT');
    expect(frame).toBe('MAV_FRAME_GLOBAL_RELATIVE_ALT_INT');
    expect(vehicleType).toBe('copter');
    expect(params).toHaveLength(7);
    expect(MISSION_COMMANDS).toContain('MAV_CMD_NAV_TAKEOFF');
    expect(MISSION_FRAMES).toContain('MAV_FRAME_GLOBAL_RELATIVE_ALT_INT');
    expect(VEHICLE_TYPES).toEqual(['plane', 'copter', 'rover', 'sub']);
  });
});
