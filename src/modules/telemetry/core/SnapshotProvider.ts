import type { FlightTelemetry } from './FlightTelemetryModel';

/**
 * Duck-typed telemetry snapshot provider.
 * Implemented by TelemetryManager and interpolation/smoothing adapters.
 */
export interface SnapshotProvider {
  getSnapshot(): Readonly<FlightTelemetry>;
  getExtrapolatedSnapshot?(nowMs: number): Readonly<FlightTelemetry>;
}
