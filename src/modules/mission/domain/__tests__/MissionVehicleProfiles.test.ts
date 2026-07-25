import { describe, expect, it } from 'vitest';
import {
  MISSION_VEHICLE_PROFILES,
  getMissionVehicleProfile,
  isCommandAllowedForVehicle,
} from '../MissionVehicleProfiles';

describe('MissionVehicleProfiles', () => {
  it('defines the four initial ArduPilot vehicle profiles', () => {
    expect(Object.keys(MISSION_VEHICLE_PROFILES)).toEqual(['plane', 'copter', 'rover', 'sub']);
    expect(getMissionVehicleProfile('copter').defaultFrame).toBe('MAV_FRAME_GLOBAL_RELATIVE_ALT_INT');
    expect(getMissionVehicleProfile('rover').maxAltitudeM).toBe(0);
  });

  it('allows commands by vehicle capability', () => {
    expect(isCommandAllowedForVehicle('copter', 'MAV_CMD_NAV_TAKEOFF')).toBe(true);
    expect(isCommandAllowedForVehicle('rover', 'MAV_CMD_NAV_TAKEOFF')).toBe(false);
    expect(isCommandAllowedForVehicle('plane', 'MAV_CMD_NAV_SPLINE_WAYPOINT')).toBe(false);
  });

  it('allows VTOL mission commands only for plane profiles', () => {
    expect(isCommandAllowedForVehicle('plane', 'MAV_CMD_NAV_VTOL_TAKEOFF')).toBe(true);
    expect(isCommandAllowedForVehicle('plane', 'MAV_CMD_NAV_VTOL_LAND')).toBe(true);
    expect(isCommandAllowedForVehicle('plane', 'MAV_CMD_DO_LAND_START')).toBe(true);
    expect(isCommandAllowedForVehicle('copter', 'MAV_CMD_NAV_VTOL_TAKEOFF')).toBe(false);
    expect(isCommandAllowedForVehicle('copter', 'MAV_CMD_NAV_VTOL_LAND')).toBe(false);
    expect(isCommandAllowedForVehicle('copter', 'MAV_CMD_DO_LAND_START')).toBe(false);
    expect(isCommandAllowedForVehicle('rover', 'MAV_CMD_DO_LAND_START')).toBe(false);
    expect(isCommandAllowedForVehicle('sub', 'MAV_CMD_DO_LAND_START')).toBe(false);
  });
});
