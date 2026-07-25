import { ArmState } from '../../telemetry';
import type { MAVStatusText, NormalizedTelemetry } from '../../telemetry';
import type { Drone } from '../../drone';
import type { FailsafeEvent } from '../../../systems/failsafe/FailsafeTypes';
import { MissionState } from '../../mission/core/MissionState';

export type OperationalLinkState =
  | 'down'
  | 'connecting'
  | 'simulation'
  | 'live_not_ready'
  | 'ready';

export type OperationalSeverity = 'info' | 'warning' | 'critical';

export type OperationalCommand =
  | 'ARM'
  | 'DISARM'
  | 'TAKEOFF'
  | 'LAND'
  | 'RTL'
  | 'LOITER'
  | 'GUIDED'
  | 'AUTO'
  | 'KILL'
  | 'EMERGENCY_LAND';

export interface OperationalMessage {
  id: string;
  severity: OperationalSeverity;
  label: string;
  detail: string;
}

export interface OperationalCommandGate {
  canArm: boolean;
  canDisarm: boolean;
  canTakeoff: boolean;
  canLand: boolean;
  canRtl: boolean;
  canLoiter: boolean;
  canGuided: boolean;
  canAuto: boolean;
  canMotorKill: boolean;
  canEmergencyLand: boolean;
  reasons: Partial<Record<OperationalCommand, string>>;
}

export interface OperationalReadiness {
  activeDroneId: string | null;
  linkState: OperationalLinkState;
  readyForFlight: boolean;
  summary: string;
  blockers: OperationalMessage[];
  warnings: OperationalMessage[];
  commandGate: OperationalCommandGate;
  autopilotStatusTextMessages: readonly MAVStatusText[];
}

export type ReadinessTelemetryInput = Pick<
  NormalizedTelemetry,
  'connected' | 'readyForFlight' | 'gpsFixStatus'
>;

export interface BuildOperationalReadinessInput {
  activeDrone: Drone | null;
  connectionStatus: 'connected';
  operationalStatus: 'operational';
  isSimulation: true;
  simulationArmCommandsAvailable: boolean;
  normTelemetry: ReadinessTelemetryInput | null;
  armState: ArmState | null;
  armCommandStatus: 'idle';
  armCommandInFlight: null;
  operationalCommandStatus: 'idle';
  operationalCommandInFlight: null;
  activeFailsafes: FailsafeEvent[];
  autopilotStatusTextMessages: readonly MAVStatusText[];
}

const COMMANDS: readonly OperationalCommand[] = [
  'ARM',
  'DISARM',
  'TAKEOFF',
  'LAND',
  'RTL',
  'LOITER',
  'GUIDED',
  'AUTO',
  'KILL',
  'EMERGENCY_LAND',
];

function message(
  id: string,
  severity: OperationalSeverity,
  label: string,
  detail: string,
): OperationalMessage {
  return { id, severity, label, detail };
}

function allCommandsBlocked(reason: string): OperationalCommandGate {
  return {
    canArm: false,
    canDisarm: false,
    canTakeoff: false,
    canLand: false,
    canRtl: false,
    canLoiter: false,
    canGuided: false,
    canAuto: false,
    canMotorKill: false,
    canEmergencyLand: false,
    reasons: Object.fromEntries(COMMANDS.map((command) => [command, reason])),
  };
}

function configureSimulationArmCommands(
  input: BuildOperationalReadinessInput,
): OperationalCommandGate {
  const gate = allCommandsBlocked('Sistema no listo para comandos.');
  const activeDrone = input.activeDrone;
  if (activeDrone === null) return gate;

  const missionLifecycleIdle = activeDrone.missionLifecycleState === undefined
    || activeDrone.missionLifecycleState === MissionState.IDLE;
  const manualSimulationAllowed = input.simulationArmCommandsAvailable && missionLifecycleIdle;
  const missionOwnedReason = 'Comando ARM/DISARM manual bloqueado durante mision simulada.';

  gate.reasons = {};
  gate.canArm = manualSimulationAllowed && input.armState === ArmState.DISARMED;
  gate.canDisarm = manualSimulationAllowed && input.armState === ArmState.ARMED;

  if (!manualSimulationAllowed) {
    gate.reasons.ARM = missionOwnedReason;
    gate.reasons.DISARM = missionOwnedReason;
  } else if (input.armState === ArmState.ARMED) {
    gate.reasons.ARM = 'La aeronave ya esta armada.';
  } else if (input.armState === ArmState.DISARMED) {
    gate.reasons.DISARM = 'La aeronave no esta armada.';
  } else {
    gate.reasons.ARM = 'Confirma el estado de armado por telemetria antes de armar.';
    gate.reasons.DISARM = 'Confirma el estado de armado por telemetria antes de desarmar.';
  }

  gate.reasons.TAKEOFF = 'El despegue no esta conectado para simulacion manual.';
  gate.reasons.LAND = 'El aterrizaje no esta conectado para simulacion manual.';
  gate.reasons.RTL = 'RTL no esta conectado para simulacion manual.';
  gate.reasons.LOITER = 'LOITER no esta conectado para simulacion manual.';
  gate.reasons.GUIDED = 'GUIDED no esta conectado para simulacion manual.';
  gate.reasons.AUTO = 'Usa el flujo de mision para simulacion AUTO.';
  gate.reasons.KILL = 'Motor kill no esta disponible en simulacion.';
  gate.reasons.EMERGENCY_LAND = 'Emergency land no esta disponible en simulacion.';
  return gate;
}

export function buildOperationalReadiness(
  input: BuildOperationalReadinessInput,
): OperationalReadiness {
  const blockers: OperationalMessage[] = [];
  const warnings: OperationalMessage[] = [];
  const activeDroneId = input.activeDrone?.id ?? null;
  const criticalFailsafes = input.activeFailsafes.filter(
    (event) => event.active && event.level === 'critical',
  );
  const warningFailsafes = input.activeFailsafes.filter(
    (event) => event.active && event.level === 'warning',
  );

  if (input.activeDrone === null) {
    blockers.push(message(
      'no-active-drone',
      'critical',
      'Sin dron activo',
      'Selecciona un dron antes de iniciar la simulacion.',
    ));
  } else {
    blockers.push(message(
      'simulation-mode',
      'info',
      'Modo simulacion',
      'La aplicacion opera exclusivamente con la simulacion local.',
    ));
  }

  for (const event of criticalFailsafes) {
    blockers.push(message(
      'failsafe-critical',
      'critical',
      'Failsafe critico',
      event.message,
    ));
  }

  for (const event of warningFailsafes) {
    warnings.push(message(
      `failsafe-${event.condition.toLowerCase()}`,
      'warning',
      'Failsafe activo',
      event.message,
    ));
  }

  const blockedGate = allCommandsBlocked(
    blockers[0]?.detail ?? 'Sistema no listo para comandos.',
  );
  const commandGate = input.activeDrone !== null && criticalFailsafes.length === 0
    ? configureSimulationArmCommands(input)
    : blockedGate;

  return {
    activeDroneId,
    linkState: input.activeDrone === null ? 'down' : 'simulation',
    readyForFlight: false,
    summary: criticalFailsafes.length > 0
      ? 'Bloqueado por failsafe critico'
      : input.activeDrone === null
        ? 'Sin dron activo'
        : 'Simulacion activa',
    blockers,
    warnings,
    commandGate,
    autopilotStatusTextMessages: input.autopilotStatusTextMessages,
  };
}
