import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FLIGHT_TELEMETRY, type FlightTelemetry } from '../../telemetry';
import type { OperationalReadiness } from '../../operational';
import LeftColumn from './LeftColumn';

const READY_READINESS: OperationalReadiness = {
  activeDroneId: 'drone-test',
  linkState: 'ready',
  readyForFlight: true,
  summary: 'Listo',
  blockers: [],
  warnings: [],
  commandGate: {
    canArm: true,
    canDisarm: false,
    canTakeoff: false,
    canLand: true,
    canRtl: true,
    canLoiter: true,
    canGuided: true,
    canAuto: true,
    canMotorKill: true,
    canEmergencyLand: true,
    reasons: {},
  },
  autopilotStatusTextMessages: [],
};

const TELEMETRY: FlightTelemetry = {
  ...DEFAULT_FLIGHT_TELEMETRY,
  vehicleStatus: {
    ...DEFAULT_FLIGHT_TELEMETRY.vehicleStatus,
    flightMode: 'STABILIZE',
  },
};

describe('LeftColumn default panel', () => {
  it('opens telemetry with only simulation-safe panel choices', () => {
    const html = renderToStaticMarkup(
      <LeftColumn
        simTelemetry={TELEMETRY}
        normTelemetry={null}
        readiness={READY_READINESS}
      />,
    );

    expect(html).toContain('aria-label="Ver telemetría del dron" aria-pressed="true"');
    expect(html).toContain('aria-label="Comprobaciones previas"');
    expect(html).toContain('aria-label="Estado del sistema"');
    expect(html).not.toContain('Controles de vuelo');
    expect(html).not.toContain('Cámara virtual');
    expect(html).not.toContain('Cámara real');
  });
});
