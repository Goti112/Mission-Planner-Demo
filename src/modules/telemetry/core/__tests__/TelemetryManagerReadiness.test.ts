import { describe, expect, it } from 'vitest';
import { MockTelemetrySource, TelemetryManager } from '../TelemetryManager';
import type { TelemetryRawData } from '../FlightTelemetryModel';
import { FlightMode, MAVState, VehicleType } from '../FlightTelemetryModel';

describe('TelemetryManager readiness + speed source', () => {
  it('uses GPS as ground speed source when GLOBAL_POSITION_INT is fresh', () => {
    const source = new MockTelemetrySource();
    const manager = new TelemetryManager(source, { emitAllFrames: true });

    source.inject({
      capturedAt: Date.now(),
      sysId: 1,
      compId: 1,
      globalPosition: {
        timeBootMs: 1,
        lat: 404168000,
        lon: -37038000,
        alt: 100000,
        relativeAlt: 5000,
        vx: 1000,
        vy: 0,
        vz: 0,
        hdg: 9000,
      },
    } as TelemetryRawData);

    expect(manager.latestNormTelemetry?.speedSource).toBe('GPS');
    expect(manager.latestNormTelemetry?.groundSpeed).toBeCloseTo(10, 3);
  });

  it('marks readyForFlight false when simulation GPS fix is below 3D', () => {
    const source = new MockTelemetrySource();
    const manager = new TelemetryManager(source, { emitAllFrames: true });

    source.inject({
      capturedAt: Date.now(),
      sysId: 1,
      compId: 1,
      heartbeat: {
        type: VehicleType.QUADROTOR,
        autopilot: 3,
        baseMode: 0,
        customMode: 3,
        systemStatus: MAVState.ACTIVE,
        mavlinkVersion: 3,
      },
      gpsRaw: {
        timeUsec: 1,
        fixType: 2,
        lat: 404168000,
        lon: -37038000,
        alt: 100000,
        eph: 100,
        epv: 100,
        vel: 0,
        cog: 0,
        satellitesVisible: 10,
      },
    } as TelemetryRawData);

    expect(manager.latestNormTelemetry?.readyForFlight).toBe(false);
  });

  it('decodes simulation heartbeat modes used by SimulationTelemetrySource', () => {
    const simulationModes: readonly {
      readonly customMode: number;
      readonly flightMode: FlightMode;
      readonly label: string;
    }[] = [
      { customMode: 0, flightMode: FlightMode.STABILIZE, label: 'STABILIZE' },
      { customMode: 3, flightMode: FlightMode.AUTO, label: 'AUTO' },
      { customMode: 4, flightMode: FlightMode.GUIDED, label: 'GUIDED' },
      { customMode: 9, flightMode: FlightMode.LAND, label: 'LAND' },
      { customMode: 25, flightMode: FlightMode.TAKEOFF, label: 'TAKEOFF' },
    ];

    for (const expected of simulationModes) {
      const source = new MockTelemetrySource();
      const manager = new TelemetryManager(source, { emitAllFrames: true });

      source.inject({
        capturedAt: Date.now(),
        sysId: 1,
        compId: 1,
        heartbeat: {
          type: VehicleType.QUADROTOR,
          autopilot: 3,
          baseMode: 0,
          customMode: expected.customMode,
          systemStatus: MAVState.ACTIVE,
          mavlinkVersion: 3,
        },
      } as TelemetryRawData);

      expect(manager.latestTelemetry?.vehicleStatus.flightMode).toBe(expected.flightMode);
      expect(manager.latestTelemetry?.vehicleStatus.flightModeLabel).toBe(expected.label);
    }
  });
});
