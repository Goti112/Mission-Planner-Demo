/**
 * core/navigation — Autopilot navigation subsystem
 *
 * NavigationController: per-drone realistic UAV autopilot controller.
 * Produces smooth heading, speed, and altitude control for waypoint missions.
 */

export { NavigationController } from './NavigationController';
export type { NavControllerConfig, NavControllerOutput } from './NavigationController';
