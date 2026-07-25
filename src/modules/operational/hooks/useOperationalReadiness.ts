import { useMemo } from 'react';
import type { FlightTelemetry, NormalizedTelemetry } from '../../telemetry';
import {
  buildOperationalReadiness,
  type OperationalReadiness,
} from '../core/OperationalReadiness';
import { droneRuntime, useDroneStore } from '../../drone';
import { useFailsafeStore } from '../../../systems/failsafe/FailsafeStore';

interface UseOperationalReadinessArgs {
  telemetry: FlightTelemetry | null;
  normTelemetry: NormalizedTelemetry | null;
}

export function useOperationalReadiness({
  telemetry,
  normTelemetry,
}: UseOperationalReadinessArgs): OperationalReadiness {
  const drones = useDroneStore((s) => s.drones);
  const activeFailsafeRecord = useFailsafeStore((s) => s.active);

  const activeDrone = useMemo(
    () => Object.values(drones).find((drone) => drone.active) ?? null,
    [drones],
  );

  const activeFailsafes = useMemo(
    () => Object.values(activeFailsafeRecord).filter((event) => {
      if (!activeDrone) return false;
      return event.droneId === activeDrone.id && event.active;
    }),
    [activeDrone, activeFailsafeRecord],
  );

  const hasConfirmedArmTelemetry = telemetry !== null
    && telemetry.vehicleStatus.isConnected
    && telemetry.vehicleStatus.lastHeartbeatMs > 0;
  const armState = hasConfirmedArmTelemetry ? telemetry.vehicleStatus.armState : null;
  const simulationArmCommandsAvailable = useMemo(() => {
    if (!activeDrone) return false;
    const source = droneRuntime.getSource(activeDrone.id);
    return source !== null && !source.hasMissionOverride;
  }, [activeDrone]);

  return useMemo(
    () => buildOperationalReadiness({
      activeDrone,
      connectionStatus: 'connected',
      operationalStatus: 'operational',
      isSimulation: true,
      simulationArmCommandsAvailable,
      normTelemetry,
      armState,
      armCommandStatus: 'idle',
      armCommandInFlight: null,
      operationalCommandStatus: 'idle',
      operationalCommandInFlight: null,
      activeFailsafes,
      autopilotStatusTextMessages: telemetry?.statusTextMessages ?? [],
    }),
    [
      activeDrone,
      simulationArmCommandsAvailable,
      normTelemetry,
      armState,
      activeFailsafes,
      telemetry?.statusTextMessages,
    ],
  );
}

