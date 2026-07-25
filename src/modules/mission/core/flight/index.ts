/**
 * core/flight — Flight dynamics subsystem
 *
 * FlightDynamics: per-drone realistic attitude simulation.
 * Produces smooth roll (bank), pitch, and yaw pass-through
 * for the PFD artificial horizon, 3D model orientation, and telemetry.
 */

export { FlightDynamics } from './FlightDynamics';
export type { FlightDynamicsConfig, AttitudeOutput } from './FlightDynamics';
