import { describe, expect, it } from 'vitest';
import {
  MISSION_COMMAND_CATALOG,
  MISSION_VEHICLE_PROFILES,
  MissionCommandCatalog,
  MissionItemFactory,
  MissionMetrics,
  MissionSelectors,
  MissionTypes,
  MissionValidation,
  MissionVehicleProfiles,
  createMissionItem,
  validateMissionPlan,
} from '../index';

describe('Mission domain barrel exports', () => {
  it('exports the public domain API', () => {
    expect(MISSION_COMMAND_CATALOG.MAV_CMD_NAV_WAYPOINT.mavlinkId).toBe(16);
    expect(MISSION_VEHICLE_PROFILES.copter.vehicleType).toBe('copter');
    expect(typeof createMissionItem).toBe('function');
    expect(typeof validateMissionPlan).toBe('function');
  });

  it('exports public domain API namespaces', () => {
    expect(MissionTypes.VEHICLE_TYPES).toContain('copter');
    expect(MissionCommandCatalog.MISSION_COMMAND_CATALOG.MAV_CMD_NAV_WAYPOINT.mavlinkId).toBe(16);
    expect(MissionVehicleProfiles.MISSION_VEHICLE_PROFILES.copter.vehicleType).toBe('copter');
    expect(typeof MissionItemFactory.createMissionItem).toBe('function');
    expect(typeof MissionSelectors.selectMissionTableRows).toBe('function');
    expect(typeof MissionMetrics.calculateDomainMissionMetrics).toBe('function');
    expect(typeof MissionValidation.validateMissionPlan).toBe('function');
  });
});
