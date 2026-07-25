import { describe, expect, it } from 'vitest';

import {
  selectDisplayedThrottlePercent,
} from '../ThrottleIndicator';
import {
  DEFAULT_FLIGHT_TELEMETRY,
  type ControlSurfacesSource,
  type FlightTelemetry,
} from '../../../telemetry';

function makeTelemetry(
  controlSurfacesSource: ControlSurfacesSource,
  velocityThrottlePercent: number,
  controlSurfaceThrottlePct: number,
): FlightTelemetry {
  return {
    ...DEFAULT_FLIGHT_TELEMETRY,
    velocity: {
      ...DEFAULT_FLIGHT_TELEMETRY.velocity,
      throttlePercent: velocityThrottlePercent,
    },
    controlSurfaces: {
      ...DEFAULT_FLIGHT_TELEMETRY.controlSurfaces,
      throttlePct: controlSurfaceThrottlePct,
    },
    controlSurfacesSource,
  };
}

describe('selectDisplayedThrottlePercent', () => {
  it('uses the RC throttle channel when control surfaces come from RC input', () => {
    const telemetry = makeTelemetry('RC_CHANNELS', 0, 73);

    expect(selectDisplayedThrottlePercent(telemetry)).toBe(73);
  });

  it('falls back to VFR HUD throttle when control surfaces are held', () => {
    const telemetry = makeTelemetry('PREV_HOLD', 42, 73);

    expect(selectDisplayedThrottlePercent(telemetry)).toBe(42);
  });
});
