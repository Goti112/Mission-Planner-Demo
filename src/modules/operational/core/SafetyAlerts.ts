import type {
  FailsafeCondition,
  FailsafeEvent,
  FailsafeLevel,
} from '../../../systems/failsafe/FailsafeTypes';
import type {
  OperationalCommand,
  OperationalMessage,
  OperationalReadiness,
  OperationalSeverity,
} from './OperationalReadiness';

export type SafetyAlertSource = 'readiness' | 'prearm' | 'failsafe';

export interface SafetyAlert {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  source: SafetyAlertSource;
  dismissible: boolean;
  triggeredAt: number;
  droneId: string | null;
  command: OperationalCommand | null;
}

const SURFACED_COMMANDS: OperationalCommand[] = ['ARM', 'TAKEOFF'];
const MAX_STATUS_TEXT_ALERTS = 4;

const FAILSAFE_TITLES: Record<FailsafeCondition, string> = {
  SIGNAL_LOST: 'LINK PERDIDO',
  LOW_BATTERY: 'BATERIA BAJA',
  CRITICAL_BATTERY: 'BATERIA CRITICA',
  GPS_LOST: 'GPS DEBIL',
  GEO_LIMIT: 'GEOFENCE',
  ALTITUDE_LIMIT: 'ALTITUD EXCEDIDA',
};

const READINESS_TITLES: Record<string, string> = {
  'no-active-drone': 'SIN DRON ACTIVO',
  'simulation-mode': 'SIMULACION ACTIVA',
  'link-down': 'LINK DESCONECTADO',
  'link-connecting': 'LINK CONECTANDO',
  'telemetry-not-ready': 'PREARM - TELEMETRIA NO LISTA',
  'failsafe-critical': 'FAILSAFE CRITICO',
};

const COMMAND_TITLES: Record<OperationalCommand, string> = {
  ARM: 'NO ARMAR',
  DISARM: 'NO DESARMAR',
  TAKEOFF: 'NO DESPEGAR',
  LAND: 'NO ATERRIZAR',
  RTL: 'RTL BLOQUEADO',
  LOITER: 'LOITER BLOQUEADO',
  GUIDED: 'GUIDED BLOQUEADO',
  AUTO: 'AUTO BLOQUEADO',
  KILL: 'MOTOR KILL BLOQUEADO',
  EMERGENCY_LAND: 'EMERGENCY LAND BLOQUEADO',
};

function severityFromOperationalSeverity(severity: OperationalSeverity): 'warning' | 'critical' {
  if (severity === 'critical') return 'critical';
  return 'warning';
}

function severityFromFailsafeLevel(level: FailsafeLevel): 'warning' | 'critical' {
  if (level === 'critical') return 'critical';
  return 'warning';
}

function titleFromReadinessMessage(message: OperationalMessage): string {
  return READINESS_TITLES[message.id] ?? message.label.toUpperCase();
}

function isFailsafeReadinessMessage(message: OperationalMessage): boolean {
  return message.id === 'failsafe-critical' || message.id.startsWith('failsafe-');
}

function buildReadinessAlert(
  message: OperationalMessage,
  activeDroneId: string | null,
): SafetyAlert {
  const severity = severityFromOperationalSeverity(message.severity);

  return {
    id: `readiness:${message.id}`,
    severity,
    title: titleFromReadinessMessage(message),
    detail: message.detail,
    source: 'readiness',
    dismissible: severity === 'warning',
    triggeredAt: 0,
    droneId: activeDroneId,
    command: null,
  };
}

function commandIsAllowed(readiness: OperationalReadiness, command: OperationalCommand): boolean {
  switch (command) {
    case 'ARM':
      return readiness.commandGate.canArm;
    case 'DISARM':
      return readiness.commandGate.canDisarm;
    case 'TAKEOFF':
      return readiness.commandGate.canTakeoff;
    case 'LAND':
      return readiness.commandGate.canLand;
    case 'RTL':
      return readiness.commandGate.canRtl;
    case 'LOITER':
      return readiness.commandGate.canLoiter;
    case 'GUIDED':
      return readiness.commandGate.canGuided;
    case 'AUTO':
      return readiness.commandGate.canAuto;
    case 'KILL':
      return readiness.commandGate.canMotorKill;
    case 'EMERGENCY_LAND':
      return readiness.commandGate.canEmergencyLand;
  }
}

function buildCommandAlert(
  readiness: OperationalReadiness,
  command: OperationalCommand,
  reason: string,
): SafetyAlert {
  return {
    id: `command:${command}`,
    severity: 'critical',
    title: COMMAND_TITLES[command],
    detail: reason,
    source: 'prearm',
    dismissible: false,
    triggeredAt: 0,
    droneId: readiness.activeDroneId,
    command,
  };
}

function buildFailsafeAlert(event: FailsafeEvent): SafetyAlert {
  const severity = severityFromFailsafeLevel(event.level);

  return {
    id: `failsafe:${event.droneId}:${event.condition}`,
    severity,
    title: FAILSAFE_TITLES[event.condition],
    detail: event.message,
    source: 'failsafe',
    dismissible: severity === 'warning',
    triggeredAt: event.triggeredAt,
    droneId: event.droneId,
    command: null,
  };
}

function normalizeStatusTextId(text: string): string {
  const id = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id.length > 0 ? id.slice(0, 80) : 'message';
}

function isPreArmStatusText(text: string): boolean {
  const normalized = text.trim().toUpperCase();
  return normalized.startsWith('PREARM:')
    || normalized.startsWith('ARM:')
    || normalized.startsWith('ARMING:');
}

function statusTextTitle(text: string): string {
  const upper = text.toUpperCase();
  if (upper.includes('GPS')) return 'PREARM - GPS';
  if (upper.includes('COMPASS') || upper.includes('MAG')) return 'PREARM - COMPASS';
  if (upper.includes('EKF') || upper.includes('AHRS')) return 'PREARM - EKF';
  if (upper.includes('BATT') || upper.includes('BATTERY')) return 'PREARM - BATERIA';
  if (upper.startsWith('ARM:') || upper.startsWith('ARMING:')) return 'ARMADO BLOQUEADO';
  return 'PREARM';
}

function buildStatusTextAlert(
  message: OperationalReadiness['autopilotStatusTextMessages'][number],
  activeDroneId: string | null,
): SafetyAlert {
  const text = message.text.trim();
  const severity: 'warning' | 'critical' = isPreArmStatusText(text) || message.severity <= 3
    ? 'critical'
    : 'warning';

  return {
    id: `prearm:${normalizeStatusTextId(text)}`,
    severity,
    title: statusTextTitle(text),
    detail: text,
    source: 'prearm',
    dismissible: severity === 'warning',
    triggeredAt: message.receivedAtMs,
    droneId: activeDroneId,
    command: null,
  };
}

function buildStatusTextAlerts(readiness: OperationalReadiness): SafetyAlert[] {
  return readiness.autopilotStatusTextMessages
    .filter((message) => isPreArmStatusText(message.text))
    .slice(0, MAX_STATUS_TEXT_ALERTS)
    .map((message) => buildStatusTextAlert(message, readiness.activeDroneId));
}

function severitySortValue(alert: SafetyAlert): number {
  if (alert.severity === 'critical') return 0;
  return 1;
}

function sortSafetyAlerts(a: SafetyAlert, b: SafetyAlert): number {
  const severityDiff = severitySortValue(a) - severitySortValue(b);
  if (severityDiff !== 0) return severityDiff;
  if (a.triggeredAt !== b.triggeredAt) return b.triggeredAt - a.triggeredAt;
  return a.title.localeCompare(b.title);
}

function uniqueSafetyAlerts(alerts: SafetyAlert[]): SafetyAlert[] {
  const seen = new Set<string>();
  const unique: SafetyAlert[] = [];

  for (const alert of alerts) {
    if (!seen.has(alert.id)) {
      seen.add(alert.id);
      unique.push(alert);
    }
  }

  return unique;
}

export function buildSafetyAlerts(
  readiness: OperationalReadiness,
  activeFailsafes: FailsafeEvent[],
): SafetyAlert[] {
  const directFailsafes = activeFailsafes.filter((event) => event.active);
  const hasDirectFailsafeAlerts = directFailsafes.length > 0;
  const readinessAlerts = [...readiness.blockers, ...readiness.warnings]
    .filter((message) => !hasDirectFailsafeAlerts || !isFailsafeReadinessMessage(message))
    .map((message) => buildReadinessAlert(message, readiness.activeDroneId));

  const commandAlerts = SURFACED_COMMANDS.flatMap((command) => {
    const reason = readiness.commandGate.reasons[command];
    if (commandIsAllowed(readiness, command) || reason === undefined) return [];
    return [buildCommandAlert(readiness, command, reason)];
  });

  const failsafeAlerts = directFailsafes.map(buildFailsafeAlert);
  const statusTextAlerts = buildStatusTextAlerts(readiness);

  return uniqueSafetyAlerts([
    ...failsafeAlerts,
    ...readinessAlerts,
    ...commandAlerts,
    ...statusTextAlerts,
  ]).sort(sortSafetyAlerts);
}
