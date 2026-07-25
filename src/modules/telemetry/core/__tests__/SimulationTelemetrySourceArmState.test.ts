import { describe, expect, it } from 'vitest';
import { ArmState, parseArmState } from '../FlightTelemetryModel';
import { SimulationTelemetrySource } from '../SimulationTelemetrySource';

async function readNextHeartbeatArmState(source: SimulationTelemetrySource): Promise<ArmState> {
  return new Promise<ArmState>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: () => void = () => undefined;

    const finish = (result: { armState: ArmState } | { error: Error }): void => {
      if (settled) return;
      settled = true;
      if (timeout !== null) clearTimeout(timeout);
      source.stop();
      unsubscribe();

      if ('error' in result) {
        reject(result.error);
        return;
      }

      resolve(result.armState);
    };

    unsubscribe = source.onData((packet) => {
      if (!packet.heartbeat) return;
      finish({ armState: parseArmState(packet.heartbeat.baseMode) });
    });

    timeout = setTimeout(() => {
      finish({ error: new Error('Timed out waiting for simulated heartbeat') });
    }, 350);

    source.start();
  });
}

describe('SimulationTelemetrySource arm state command', () => {
  it('emits DISARMED by default', async () => {
    const source = new SimulationTelemetrySource({ rateHz: 40, noiseScale: 0 });

    await expect(readNextHeartbeatArmState(source)).resolves.toBe(ArmState.DISARMED);
  });

  it('emits ARMED after setArmState(true)', async () => {
    const source = new SimulationTelemetrySource({ rateHz: 40, noiseScale: 0 });

    source.setArmState(true);

    await expect(readNextHeartbeatArmState(source)).resolves.toBe(ArmState.ARMED);
  });

  it('emits DISARMED after setArmState(false)', async () => {
    const source = new SimulationTelemetrySource({ rateHz: 40, noiseScale: 0 });

    source.setArmState(true);
    source.setArmState(false);

    await expect(readNextHeartbeatArmState(source)).resolves.toBe(ArmState.DISARMED);
  });
});
