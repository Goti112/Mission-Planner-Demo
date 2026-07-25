export const VEHICLE_TYPES = ['plane', 'copter', 'rover', 'sub'] as const;
export type MissionVehicleType = (typeof VEHICLE_TYPES)[number];

export const MISSION_FRAMES = [
  'MAV_FRAME_GLOBAL',
  'MAV_FRAME_GLOBAL_RELATIVE_ALT',
  'MAV_FRAME_GLOBAL_INT',
  'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
  'MAV_FRAME_GLOBAL_TERRAIN_ALT_INT',
  'MAV_FRAME_MISSION',
] as const;
export type MissionFrame = (typeof MISSION_FRAMES)[number];

export const MISSION_COMMANDS = [
  'MAV_CMD_NAV_TAKEOFF',
  'MAV_CMD_NAV_VTOL_TAKEOFF',
  'MAV_CMD_NAV_WAYPOINT',
  'MAV_CMD_NAV_SPLINE_WAYPOINT',
  'MAV_CMD_NAV_LOITER_UNLIM',
  'MAV_CMD_NAV_LOITER_TURNS',
  'MAV_CMD_NAV_LOITER_TIME',
  'MAV_CMD_NAV_LAND',
  'MAV_CMD_NAV_VTOL_LAND',
  'MAV_CMD_NAV_RETURN_TO_LAUNCH',
  'MAV_CMD_DO_CHANGE_SPEED',
  'MAV_CMD_DO_SET_SERVO',
  'MAV_CMD_DO_SET_RELAY',
  'MAV_CMD_DO_DIGICAM_CONTROL',
  'MAV_CMD_DO_SET_CAM_TRIGG_DIST',
  'MAV_CMD_DO_SET_ROI',
  'MAV_CMD_DO_LAND_START',
  'MAV_CMD_NAV_DELAY',
] as const;
export type MissionCommand = (typeof MISSION_COMMANDS)[number];

export type MissionParamValue = number | null;
export type MissionParams = readonly [
  MissionParamValue,
  MissionParamValue,
  MissionParamValue,
  MissionParamValue,
  MissionParamValue,
  MissionParamValue,
  MissionParamValue,
];

export interface MissionCoordinate {
  readonly lat: number;
  readonly lng: number;
  readonly alt: number;
}

export interface MissionHome {
  readonly lat: number;
  readonly lng: number;
  readonly alt: number;
}

export interface MissionItem {
  readonly id: string;
  readonly seq: number;
  readonly command: MissionCommand;
  readonly frame: MissionFrame;
  readonly current: boolean;
  readonly autocontinue: boolean;
  readonly params: MissionParams;
  readonly coordinate: MissionCoordinate | null;
}

export interface MissionPlan {
  readonly id: string;
  readonly vehicleType: MissionVehicleType;
  readonly home: MissionHome | null;
  readonly items: readonly MissionItem[];
  readonly updatedAtIso: string;
}

export type MissionParamIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface MissionCommandParamDefinition {
  readonly index: MissionParamIndex;
  readonly label: string;
  readonly unit: string | null;
  readonly required: boolean;
}

export interface MissionCommandDefinition {
  readonly command: MissionCommand;
  readonly mavlinkId: number;
  readonly label: string;
  readonly category: 'nav' | 'do';
  readonly hasCoordinate: boolean;
  readonly defaultFrame: MissionFrame;
  readonly supportedFrames: readonly MissionFrame[];
  readonly params: readonly MissionCommandParamDefinition[];
}

export interface MissionVehicleProfile {
  readonly vehicleType: MissionVehicleType;
  readonly label: string;
  readonly defaultFrame: MissionFrame;
  readonly defaultTakeoffAltitudeM: number;
  readonly defaultCruiseSpeedMps: number;
  readonly minAltitudeM: number;
  readonly maxAltitudeM: number;
  readonly supportsSplineWaypoints: boolean;
  readonly allowedCommands: readonly MissionCommand[];
}

export interface MissionTableRow {
  readonly id: string;
  readonly seq: number;
  readonly command: MissionCommand;
  readonly frame: MissionFrame;
  readonly param1: MissionParamValue;
  readonly param2: MissionParamValue;
  readonly param3: MissionParamValue;
  readonly param4: MissionParamValue;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly alt: number | null;
  readonly autocontinue: boolean;
}

export interface MissionMapPoint {
  readonly id: string;
  readonly seq: number;
  readonly command: MissionCommand;
  readonly lat: number;
  readonly lng: number;
  readonly alt: number;
}

export interface MissionSegmentDistance {
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly distanceM: number;
}

export interface MissionAltitudeProfilePoint {
  readonly seq: number;
  readonly label: string;
  readonly distanceM: number;
  readonly altitudeM: number;
}

export interface DomainMissionMetrics {
  readonly spatialItemCount: number;
  readonly commandCount: number;
  readonly totalDistanceM: number;
  readonly segmentDistances: readonly MissionSegmentDistance[];
  readonly durationSeconds: number;
  readonly altitudeProfile: readonly MissionAltitudeProfilePoint[];
  readonly maxAltitudeM: number | null;
  readonly minAltitudeM: number | null;
}

export type MissionValidationSeverity = 'error' | 'warning';

export interface MissionValidationIssue {
  readonly severity: MissionValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly itemId: string | null;
  readonly seq: number | null;
}

export interface MissionValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly MissionValidationIssue[];
  readonly warnings: readonly MissionValidationIssue[];
}

export class MissionDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissionDomainError';
  }
}
