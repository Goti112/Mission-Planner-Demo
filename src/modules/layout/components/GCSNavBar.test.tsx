import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GCSNavBar } from './GCSNavBar';
import type { OperationalReadiness } from '../../operational';

vi.mock('../../replay', () => ({
  MAX_FRAMES_PER_DRONE: 1_000,
  useFlightRecorderStore: (
    selector: (state: { recordings: Record<string, never> }) => unknown,
  ): unknown => selector({ recordings: {} }),
}));

vi.mock('./DroneFleetPanel', () => ({
  DroneFleetPanel: (): null => null,
}));

vi.mock('./LanguageSelector', () => ({
  LanguageSelector: (): null => null,
}));

const readiness: OperationalReadiness = {
  activeDroneId: null,
  linkState: 'down',
  readyForFlight: false,
  summary: 'Sin dron activo',
  blockers: [],
  warnings: [],
  commandGate: {
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
    reasons: {},
  },
  autopilotStatusTextMessages: [],
};

describe('GCSNavBar', () => {
  it('renders the replay control as a non-submitting button', () => {
    render(<GCSNavBar clockTime="12:00:00" readiness={readiness} />);

    expect(screen.getByRole('button', { name: 'Replay' }).getAttribute('type')).toBe('button');
  });
});
