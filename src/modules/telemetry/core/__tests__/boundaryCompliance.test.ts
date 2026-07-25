import { describe, expect, it } from 'vitest';
import hooksBarrelSource from '../../hooks/index.ts?raw';
import telemetryIndexSource from '../../index.ts?raw';
import telemetryManagerSource from '../TelemetryManager.ts?raw';
import droneTelemetryHookSource from '../../hooks/useDroneTelemetry.ts?raw';

describe('telemetry boundary compliance', () => {
  it('keeps React hooks out of the core-safe telemetry barrel', () => {
    expect(telemetryIndexSource).not.toContain("hooks/useAutoReconnect");
    expect(telemetryIndexSource).not.toContain("hooks/useDroneTelemetry");
    expect(telemetryIndexSource).not.toContain("hooks/useMavlinkConnection");
  });

  it('publishes hooks through a dedicated hooks barrel', () => {
    expect(hooksBarrelSource).toContain('useDroneTelemetry');
    expect(hooksBarrelSource).not.toContain('useAutoReconnect');
    expect(hooksBarrelSource).not.toContain('useMavlinkConnection');
  });

  it('keeps telemetry-owned code free of HUD component imports', () => {
    expect(telemetryManagerSource).not.toContain('components/HUD');
    expect(droneTelemetryHookSource).not.toContain('components/HUD');
  });
});
