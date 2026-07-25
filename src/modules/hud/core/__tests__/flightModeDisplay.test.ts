import { describe, expect, it } from 'vitest';
import { FlightMode } from '../../../telemetry';
import {
  getPFDModeDisplayKey,
  getPFDModeDisplayLabel,
} from '../flightModeDisplay';

describe('PFD flight mode display', () => {
  it('shows RTL-family modes as AUTO in the PFD', () => {
    expect(getPFDModeDisplayKey(FlightMode.RTL, 'RTL')).toBe('AUTO');
    expect(getPFDModeDisplayLabel(FlightMode.RTL, 'RTL')).toBe('AUTO');

    expect(getPFDModeDisplayKey(FlightMode.SMART_RTL, 'SMART RTL')).toBe('AUTO');
    expect(getPFDModeDisplayLabel(FlightMode.AUTO_RTL, 'AUTO RTL')).toBe('AUTO');
  });

  it('keeps non-RTL modes unchanged', () => {
    expect(getPFDModeDisplayKey(FlightMode.GUIDED, 'GUIDED')).toBe('GUIDED');
    expect(getPFDModeDisplayLabel(FlightMode.GUIDED, 'GUIDED')).toBe('GUIDED');
  });
});
