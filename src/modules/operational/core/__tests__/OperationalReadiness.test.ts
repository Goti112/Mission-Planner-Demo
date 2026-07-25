import { describe, expect, it } from 'vitest';
import { ArmState } from '../../../telemetry';
import type { Drone } from '../../../drone';
import { MissionState } from '../../../mission/core/MissionState';
import type { FailsafeEvent } from '../../../../systems/failsafe/FailsafeTypes';
import {
  buildOperationalReadiness,
  type BuildOperationalReadinessInput,
} from '../OperationalReadiness';

const activeDrone: Drone = {
  id: 'drone-1',
  name: 'AllDrone 440-A',
  active: true,
  lat: 40.4168,
  lng: -3.7038,
  altitude: 12,
  battery: 82,
  mode: 'MANUAL',
  pitch: 0,
  roll: 0,
  yaw: 0,
  airspeed: 0,
  groundspeed: 0,
  missionState: 'IDLE',
  missionLifecycleState: 'IDLE',
};

function baseInput(
  overrides: Partial<BuildOperationalReadinessInput> = {},
): BuildOperationalReadinessInput {
  return {
    activeDrone,
    connectionStatus: 'connected',
    operationalStatus: 'operational',
    isSimulation: true,
    simulationArmCommandsAvailable: true,
    normTelemetry: null,
    armState: ArmState.DISARMED,
    armCommandStatus: 'idle',
    armCommandInFlight: null,
    operationalCommandStatus: 'idle',
    operationalCommandInFlight: null,
    activeFailsafes: [],
    autopilotStatusTextMessages: [],
    ...overrides,
  };
}

function criticalFailsafe(): FailsafeEvent {
  return {
    id: 'fs-test',
    droneId: 'drone-1',
    condition: 'CRITICAL_BATTERY',
    level: 'critical',
    action: 'LAND',
    message: 'Critical battery: 8% - immediate landing',
    triggeredAt: 1000,
    active: true,
  };
}

function expectNonArmSimulationCommandsBlocked(
  output: ReturnType<typeof buildOperationalReadiness>,
): void {
  expect(output.commandGate.canTakeoff).toBe(false);
  expect(output.commandGate.canLand).toBe(false);
  expect(output.commandGate.canRtl).toBe(false);
  expect(output.commandGate.canLoiter).toBe(false);
  expect(output.commandGate.canGuided).toBe(false);
  expect(output.commandGate.canAuto).toBe(false);
  expect(output.commandGate.canMotorKill).toBe(false);
  expect(output.commandGate.canEmergencyLand).toBe(false);
}

describe('buildOperationalReadiness', () => {
  it('blocks every command when there is no active simulation drone', () => {
    const output = buildOperationalReadiness(baseInput({ activeDrone: null }));

    expect(output.activeDroneId).toBeNull();
    expect(output.linkState).toBe('down');
    expect(output.readyForFlight).toBe(false);
    expect(output.commandGate.canArm).toBe(false);
    expect(output.blockers.map((item) => item.id)).toContain('no-active-drone');
  });

  it('allows only ARM for a disarmed idle simulation', () => {
    const output = buildOperationalReadiness(baseInput());

    expect(output.linkState).toBe('simulation');
    expect(output.readyForFlight).toBe(false);
    expect(output.commandGate.canArm).toBe(true);
    expect(output.commandGate.canDisarm).toBe(false);
    expectNonArmSimulationCommandsBlocked(output);
  });

  it('allows only DISARM for an armed idle simulation', () => {
    const output = buildOperationalReadiness(baseInput({ armState: ArmState.ARMED }));

    expect(output.commandGate.canArm).toBe(false);
    expect(output.commandGate.canDisarm).toBe(true);
    expectNonArmSimulationCommandsBlocked(output);
  });

  it('blocks ARM and DISARM when simulation arm telemetry is unknown', () => {
    const output = buildOperationalReadiness(baseInput({ armState: null }));

    expect(output.commandGate.canArm).toBe(false);
    expect(output.commandGate.canDisarm).toBe(false);
    expect(output.commandGate.reasons.ARM).toContain('estado de armado');
  });

  it('blocks manual arm commands while a simulated mission owns telemetry', () => {
    const output = buildOperationalReadiness(baseInput({
      activeDrone: {
        ...activeDrone,
        missionLifecycleState: MissionState.MISSION_RUNNING,
      },
      armState: ArmState.ARMED,
    }));

    expect(output.commandGate.canArm).toBe(false);
    expect(output.commandGate.canDisarm).toBe(false);
    expect(output.commandGate.reasons.ARM).toContain('mision simulada');
  });

  it('surfaces critical simulation failsafes and blocks arm commands', () => {
    const output = buildOperationalReadiness(baseInput({
      activeFailsafes: [criticalFailsafe()],
    }));

    expect(output.summary).toContain('failsafe');
    expect(output.commandGate.canArm).toBe(false);
    expect(output.blockers.map((item) => item.id)).toContain('failsafe-critical');
  });
});
