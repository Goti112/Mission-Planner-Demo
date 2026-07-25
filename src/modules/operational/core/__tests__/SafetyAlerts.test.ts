import { describe, expect, it } from 'vitest';
import type { FailsafeEvent } from '../../../../systems/failsafe/FailsafeTypes';
import type { OperationalReadiness } from '../OperationalReadiness';
import { buildSafetyAlerts } from '../SafetyAlerts';

function readiness(overrides: Partial<OperationalReadiness>): OperationalReadiness {
  return {
    activeDroneId: 'drone-1',
    linkState: 'ready',
    readyForFlight: true,
    summary: 'Listo para vuelo',
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
      reasons: {
        DISARM: 'La aeronave no esta armada.',
        TAKEOFF: 'Arma la aeronave antes de despegar.',
      },
    },
    autopilotStatusTextMessages: [],
    ...overrides,
  };
}

function failsafe(overrides: Partial<FailsafeEvent>): FailsafeEvent {
  return {
    id: 'fs-critical',
    droneId: 'drone-1',
    condition: 'CRITICAL_BATTERY',
    level: 'critical',
    action: 'LAND',
    message: 'Critical battery: 8% - immediate landing',
    triggeredAt: 2000,
    active: true,
    ...overrides,
  };
}

describe('buildSafetyAlerts', () => {
  it('creates a red pre-arm alert when ARM is blocked by unknown arm telemetry', () => {
    const baseReadiness = readiness({});
    const alerts = buildSafetyAlerts(
      readiness({
        readyForFlight: true,
        commandGate: {
          ...baseReadiness.commandGate,
          canArm: false,
          reasons: {
            ...baseReadiness.commandGate.reasons,
            ARM: 'Confirma el estado de armado por telemetria antes de armar.',
          },
        },
      }),
      [],
    );

    expect(alerts).toContainEqual(expect.objectContaining({
      id: 'command:ARM',
      severity: 'critical',
      title: 'NO ARMAR',
      detail: 'Confirma el estado de armado por telemetria antes de armar.',
      command: 'ARM',
      dismissible: false,
    }));
  });

  it('creates a takeoff pre-arm alert when TAKEOFF is blocked', () => {
    const alerts = buildSafetyAlerts(readiness({}), []);

    expect(alerts).toContainEqual(expect.objectContaining({
      id: 'command:TAKEOFF',
      severity: 'critical',
      title: 'NO DESPEGAR',
      detail: 'Arma la aeronave antes de despegar.',
      command: 'TAKEOFF',
      dismissible: false,
    }));
  });

  it('creates a pre-arm alert from autopilot STATUSTEXT messages', () => {
    const alerts = buildSafetyAlerts(
      readiness({
        commandGate: {
          ...readiness({}).commandGate,
          canTakeoff: true,
          reasons: {},
        },
        autopilotStatusTextMessages: [{
          severity: 3,
          text: 'PreArm: GPS 1: not healthy',
          receivedAtMs: 1234,
          id: 42,
          chunkSeq: 0,
        }],
      }),
      [],
    );

    expect(alerts).toContainEqual(expect.objectContaining({
      id: 'prearm:prearm-gps-1-not-healthy',
      severity: 'critical',
      title: 'PREARM - GPS',
      detail: 'PreArm: GPS 1: not healthy',
      source: 'prearm',
      dismissible: false,
      triggeredAt: 1234,
      command: null,
    }));
  });

  it('maps critical failsafes to red non-dismissible alerts', () => {
    const alerts = buildSafetyAlerts(
      readiness({
        commandGate: {
          ...readiness({}).commandGate,
          canTakeoff: true,
          reasons: {},
        },
      }),
      [
        failsafe({
          condition: 'SIGNAL_LOST',
          action: 'RTH',
          message: 'Signal lost - returning to home',
        }),
      ],
    );

    expect(alerts[0]).toEqual(expect.objectContaining({
      id: 'failsafe:drone-1:SIGNAL_LOST',
      severity: 'critical',
      title: 'LINK PERDIDO',
      detail: 'Signal lost - returning to home',
      droneId: 'drone-1',
      dismissible: false,
    }));
  });

  it('maps warning failsafes to yellow dismissible alerts', () => {
    const alerts = buildSafetyAlerts(readiness({}), [
      failsafe({
        id: 'fs-gps',
        condition: 'GPS_LOST',
        level: 'warning',
        action: 'HOVER',
        message: 'GPS weak: 4 satellites - hovering in place',
      }),
    ]);

    expect(alerts).toContainEqual(expect.objectContaining({
      id: 'failsafe:drone-1:GPS_LOST',
      severity: 'warning',
      title: 'GPS DEBIL',
      dismissible: true,
    }));
  });

  it('collapses duplicate safety alert ids to one alert', () => {
    const alerts = buildSafetyAlerts(
      readiness({
        commandGate: {
          ...readiness({}).commandGate,
          canTakeoff: true,
          reasons: {},
        },
      }),
      [
        failsafe({
          id: 'fs-low-first',
          condition: 'LOW_BATTERY',
          level: 'warning',
          message: 'Low battery: 15% - returning to home',
        }),
        failsafe({
          id: 'fs-low-second',
          condition: 'LOW_BATTERY',
          level: 'warning',
          message: 'Low battery: 14% - returning to home',
        }),
      ],
    );

    const duplicateIdAlerts = alerts.filter((alert) => alert.id === 'failsafe:drone-1:LOW_BATTERY');

    expect(duplicateIdAlerts).toHaveLength(1);
  });

  it('uses direct failsafe alerts instead of readiness-derived failsafe messages', () => {
    const alerts = buildSafetyAlerts(
      readiness({
        blockers: [{
          id: 'failsafe-critical',
          severity: 'critical',
          label: 'Failsafe critico',
          detail: 'Critical battery: 8% - immediate landing',
        }],
        commandGate: {
          ...readiness({}).commandGate,
          canTakeoff: true,
          reasons: {},
        },
      }),
      [
        failsafe({
          condition: 'CRITICAL_BATTERY',
          level: 'critical',
          action: 'LAND',
          message: 'Critical battery: 8% - immediate landing',
        }),
      ],
    );

    expect(alerts).toContainEqual(expect.objectContaining({
      id: 'failsafe:drone-1:CRITICAL_BATTERY',
      title: 'BATERIA CRITICA',
    }));
    expect(alerts).not.toContainEqual(expect.objectContaining({
      id: 'readiness:failsafe-critical',
      title: 'FAILSAFE CRITICO',
    }));
  });

  it('sorts critical alerts before warnings and newer failsafes before older failsafes', () => {
    const alerts = buildSafetyAlerts(
      readiness({
        warnings: [{
          id: 'simulation-mode',
          severity: 'info',
          label: 'Modo simulacion',
          detail: 'La interfaz puede explorarse, pero los comandos de aeronave real estan bloqueados.',
        }],
        commandGate: {
          ...readiness({}).commandGate,
          canTakeoff: true,
          reasons: {},
        },
      }),
      [
        failsafe({
          id: 'fs-low',
          condition: 'LOW_BATTERY',
          level: 'warning',
          action: 'RTH',
          message: 'Low battery: 15% - returning to home',
          triggeredAt: 1000,
        }),
        failsafe({
          id: 'fs-gps',
          condition: 'GPS_LOST',
          level: 'warning',
          action: 'HOVER',
          message: 'GPS weak: 4 satellites - hovering in place',
          triggeredAt: 2000,
        }),
        failsafe({
          id: 'fs-critical',
          condition: 'CRITICAL_BATTERY',
          level: 'critical',
          action: 'LAND',
          message: 'Critical battery: 8% - immediate landing',
          triggeredAt: 3000,
        }),
      ],
    );

    expect(alerts.map((alert) => alert.severity)[0]).toBe('critical');
    expect(alerts[0].title).toBe('BATERIA CRITICA');
    expect(alerts.map((alert) => alert.title)).toEqual([
      'BATERIA CRITICA',
      'GPS DEBIL',
      'BATERIA BAJA',
      'SIMULACION ACTIVA',
    ]);
  });
});
