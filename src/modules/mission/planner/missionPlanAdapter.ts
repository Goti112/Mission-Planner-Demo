import {
  getMissionCommandDefinition,
  validateMissionPlan,
  type MissionCommand,
  type MissionItem,
  type MissionPlan,
  type MissionValidationIssue,
} from '../domain';
import type { Waypoint } from '../../../types/mission';

export interface MissionPlanExecutionIssue {
  readonly itemId: string | null;
  readonly seq: number | null;
  readonly command: MissionCommand | null;
  readonly message: string;
}

export interface LegacyWaypointProjection {
  readonly waypoints: readonly Waypoint[];
  readonly warnings: readonly MissionPlanExecutionIssue[];
}

export interface MissionExecutionReadiness {
  readonly mode: 'SIM';
  readonly canExecute: boolean;
  readonly blockers: readonly MissionPlanExecutionIssue[];
  readonly warnings: readonly MissionPlanExecutionIssue[];
  readonly simulatedCount: number;
}

interface ProjectedLegacyWaypoint {
  readonly waypoint: Waypoint | null;
  readonly warning: MissionPlanExecutionIssue | null;
}

const executionIssue = (
  itemId: string | null,
  seq: number | null,
  command: MissionCommand | null,
  message: string,
): MissionPlanExecutionIssue => ({
  itemId,
  seq,
  command,
  message,
});

const findMissionItemCommand = (plan: MissionPlan, itemId: string | null): MissionCommand | null => {
  if (itemId === null) {
    return null;
  }

  const item = plan.items.find((missionItem) => missionItem.id === itemId);

  return item === undefined ? null : item.command;
};

const validationIssueToExecutionIssue = (
  issue: MissionValidationIssue,
  plan: MissionPlan,
): MissionPlanExecutionIssue => executionIssue(issue.itemId, issue.seq, findMissionItemCommand(plan, issue.itemId), issue.message);

const spatialCommandMissingCoordinateWarning = (item: MissionItem): MissionPlanExecutionIssue =>
  executionIssue(
    item.id,
    item.seq,
    item.command,
    `Simulation cannot project command ${item.command} because it is missing a coordinate.`,
  );

const unsupportedSimulationCommandWarning = (item: MissionItem): MissionPlanExecutionIssue => {
  const commandDefinition = getMissionCommandDefinition(item.command);
  const message =
    commandDefinition.category === 'nav'
      ? `Simulation does not project non-route navigation command ${item.command}.`
      : `Simulation does not execute non-navigation command ${item.command}.`;

  return executionIssue(item.id, item.seq, item.command, message);
};

const emptySimulationRouteBlocker = (): MissionPlanExecutionIssue =>
  executionIssue(null, null, null, 'Simulation requires at least one spatial navigation waypoint.');

const finitePositiveHoldTime = (param: number | null): number | null =>
  param !== null && Number.isFinite(param) && param > 0 ? param : null;

const commandSupportsLegacyHoldTime = (command: MissionCommand): boolean =>
  command === 'MAV_CMD_NAV_WAYPOINT' ||
  command === 'MAV_CMD_NAV_SPLINE_WAYPOINT' ||
  command === 'MAV_CMD_NAV_LOITER_UNLIM' ||
  command === 'MAV_CMD_NAV_LOITER_TURNS' ||
  command === 'MAV_CMD_NAV_LOITER_TIME';

const toLegacyWaypoint = (item: MissionItem): Waypoint => {
  if (item.coordinate === null) {
    throw new Error(`Cannot project mission item ${item.id} (${item.command}) without a coordinate.`);
  }

  const holdTime = commandSupportsLegacyHoldTime(item.command) ? finitePositiveHoldTime(item.params[0]) : null;

  return {
    id: item.id,
    lat: item.coordinate.lat,
    lng: item.coordinate.lng,
    altitude: item.coordinate.alt,
    ...(holdTime === null ? {} : { holdTime }),
    ...(item.command === 'MAV_CMD_NAV_LAND' ? { command: 'LAND' as const } : {}),
  };
};

const projectLegacyWaypoint = (item: MissionItem): ProjectedLegacyWaypoint => {
  const commandDefinition = getMissionCommandDefinition(item.command);

  if (commandDefinition.category !== 'nav' || !commandDefinition.hasCoordinate) {
    return {
      waypoint: null,
      warning: unsupportedSimulationCommandWarning(item),
    };
  }

  if (item.coordinate === null) {
    return {
      waypoint: null,
      warning: spatialCommandMissingCoordinateWarning(item),
    };
  }

  return {
    waypoint: toLegacyWaypoint(item),
    warning: null,
  };
};

export const buildLegacyWaypointsFromMissionPlan = (plan: MissionPlan): LegacyWaypointProjection => {
  const projectedWaypoints = plan.items.map(projectLegacyWaypoint);

  return {
    waypoints: projectedWaypoints
      .map((projectedWaypoint) => projectedWaypoint.waypoint)
      .filter((waypoint): waypoint is Waypoint => waypoint !== null),
    warnings: projectedWaypoints
      .map((projectedWaypoint) => projectedWaypoint.warning)
      .filter((warning): warning is MissionPlanExecutionIssue => warning !== null),
  };
};

export const evaluateMissionPlanExecution = (input: { readonly plan: MissionPlan }): MissionExecutionReadiness => {
  const validation = validateMissionPlan(input.plan);
  const validationBlockers = validation.errors.map((issue) => validationIssueToExecutionIssue(issue, input.plan));
  const validationWarnings = validation.warnings.map((issue) => validationIssueToExecutionIssue(issue, input.plan));
  const projection = buildLegacyWaypointsFromMissionPlan(input.plan);
  const emptyRouteBlockers = projection.waypoints.length === 0 ? [emptySimulationRouteBlocker()] : [];
  const blockers = [...validationBlockers, ...emptyRouteBlockers];

  return {
    mode: 'SIM',
    canExecute: blockers.length === 0,
    blockers,
    warnings: [...validationWarnings, ...projection.warnings],
    simulatedCount: projection.waypoints.length,
  };
};
