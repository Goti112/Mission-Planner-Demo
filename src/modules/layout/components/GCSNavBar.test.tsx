import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoGuide } from '../../../demo/components/DemoGuide';
import { useDemoGuideStore } from '../../../demo/guide/demoGuideStore';
import { useUIStore } from '../../../shared/store/uiStore';
import { GCSNavBar } from './GCSNavBar';
import type { OperationalReadiness } from '../../operational';

const replayTestState = vi.hoisted(() => ({
  recordings: {} as Record<string, { readonly total: number }>,
}));

vi.mock('../../replay', () => ({
  MAX_FRAMES_PER_DRONE: 1_000,
  useFlightRecorderStore: (
    selector: (state: { recordings: Record<string, { readonly total: number }> }) => unknown,
  ): unknown => selector(replayTestState),
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
  beforeEach(() => {
    replayTestState.recordings = {};
    useUIStore.setState({ currentView: 'FLIGHT' });
    useDemoGuideStore.setState({ step: 'WELCOME', isOpen: true });
  });

  it('renders the replay control as a non-submitting button', () => {
    render(<GCSNavBar clockTime="12:00:00" readiness={readiness} />);

    expect(screen.getByRole('button', { name: 'Replay' }).getAttribute('type')).toBe('button');
  });

  it('opens replay and advances review through the real highlighted control', () => {
    replayTestState.recordings = { 'drone-1': { total: 2 } };
    useDemoGuideStore.setState({ step: 'REVIEW', isOpen: true });

    render(
      <>
        <GCSNavBar clockTime="12:00:00" readiness={readiness} />
        <DemoGuide />
      </>,
    );

    const replay = screen.getByRole('button', { name: 'Replay' });

    expect(replay.getAttribute('data-demo-target')).toBe('open-replay');
    expect(replay.getAttribute('data-demo-active-target')).toBe('true');
    fireEvent.click(replay);

    expect(useUIStore.getState().currentView).toBe('REPLAY');
    expect(useDemoGuideStore.getState().step).toBe('FREE');
  });
});
