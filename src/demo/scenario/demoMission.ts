import {
  createMissionItem,
  createMissionPlan,
  type PlannerMissionRecord,
} from '../../modules/mission';
import { emptyAdvancedMissionPlan } from '../../modules/mission/planner/advancedMissionTypes';

export const DEMO_MISSION_ID = 'demo-mission';
export const DEMO_DRONE_ID = 'drone-1';
export const DEMO_MISSION_NAME = 'Synthetic Range Alpha';
export const DEMO_HOME = { lat: 40.4168, lng: -3.7038, alt: 0 } as const;

const DEMO_ROUTE = [
  { id: 'demo-takeoff', command: 'MAV_CMD_NAV_TAKEOFF', lat: 40.4172, lng: -3.7030, alt: 60 },
  { id: 'demo-waypoint-1', command: 'MAV_CMD_NAV_WAYPOINT', lat: 40.4210, lng: -3.6965, alt: 90 },
  { id: 'demo-waypoint-2', command: 'MAV_CMD_NAV_WAYPOINT', lat: 40.4260, lng: -3.7030, alt: 120 },
  { id: 'demo-waypoint-3', command: 'MAV_CMD_NAV_WAYPOINT', lat: 40.4220, lng: -3.7115, alt: 100 },
  { id: 'demo-waypoint-4', command: 'MAV_CMD_NAV_WAYPOINT', lat: 40.4160, lng: -3.7090, alt: 70 },
  { id: 'demo-land', command: 'MAV_CMD_NAV_LAND', lat: 40.4168, lng: -3.7038, alt: 0 },
] as const;

export const createDemoMissionRecord = (): PlannerMissionRecord => ({
  id: DEMO_MISSION_ID,
  name: DEMO_MISSION_NAME,
  droneId: DEMO_DRONE_ID,
  plan: createMissionPlan({
    id: DEMO_MISSION_ID,
    vehicleType: 'copter',
    home: DEMO_HOME,
    items: DEMO_ROUTE.map((routeItem, index) => createMissionItem({
      id: routeItem.id,
      seq: index,
      command: routeItem.command,
      frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      current: false,
      autocontinue: true,
      params: [0, 0, 0, 0, routeItem.lat, routeItem.lng, routeItem.alt],
      coordinate: {
        lat: routeItem.lat,
        lng: routeItem.lng,
        alt: routeItem.alt,
      },
    })),
    updatedAtIso: '2026-01-01T00:00:00.000Z',
  }),
  advanced: emptyAdvancedMissionPlan(),
  status: 'idle',
  currentItemIndex: 0,
  progress: 0,
  legacyMissionId: null,
});
