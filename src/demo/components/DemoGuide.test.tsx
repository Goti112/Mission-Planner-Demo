import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MapToolbar } from '../../modules/map/components/MapToolbar';
import MissionPlanToolbar from '../../modules/mission/planner/MissionPlanToolbar';
import type { MissionExecutionReadiness } from '../../modules/mission/planner/missionPlanAdapter';
import { useUIStore } from '../../shared/store/uiStore';
import { createDemoMissionRecord } from '../scenario/demoMission';
import { resetDemoScenario } from '../scenario/resetDemoScenario';
import { useDemoGuideStore } from '../guide/demoGuideStore';
import { DemoBanner } from './DemoBanner';
import { DemoGuide } from './DemoGuide';

vi.mock('../scenario/resetDemoScenario', () => ({
  resetDemoScenario: vi.fn(),
}));

const setGuideStep = (
  step: 'WELCOME' | 'PLAN' | 'FLY' | 'INSPECT' | 'REVIEW' | 'FREE',
): void => {
  act(() => {
    useDemoGuideStore.setState({
      step,
      isOpen: step !== 'FREE',
    });
  });
};

const executableMissionReadiness: MissionExecutionReadiness = {
  mode: 'SIM',
  canExecute: true,
  blockers: [],
  warnings: [],
  simulatedCount: 6,
};

describe('guided demo interface', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    useUIStore.setState({ currentView: 'FLIGHT' });
    useDemoGuideStore.setState({ step: 'WELCOME', isOpen: true });
  });

  it('keeps the simulation banner visible after the visitor leaves the guide', () => {
    setGuideStep('FREE');

    render(<DemoBanner />);

    expect(screen.getByText('SIMULATION DEMO')).toBeTruthy();
    expect(screen.getByText('Synthetic data only')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restart tour' })).toBeTruthy();
  });

  it('offers review, free exploration, and close controls at welcome', () => {
    render(<DemoGuide />);

    expect(screen.getByRole('button', { name: 'Review mission' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Explore freely' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close tour' })).toBeTruthy();
  });

  it('opens the plan workspace and advances when the visitor reviews the mission', () => {
    render(<DemoGuide />);

    fireEvent.click(screen.getByRole('button', { name: 'Review mission' }));

    expect(useUIStore.getState().currentView).toBe('PLAN');
    expect(useDemoGuideStore.getState().step).toBe('PLAN');
  });

  it('starts from the real highlighted mission control and opens flight telemetry', () => {
    const startSimulation = vi.fn();
    setGuideStep('PLAN');
    useUIStore.setState({ currentView: 'PLAN' });

    render(
      <>
        <MissionPlanToolbar
          mission={createDemoMissionRecord()}
          droneOptions={[{ id: 'drone-1', name: 'AllDrone 440-A' }]}
          selectedDroneId="drone-1"
          metrics={null}
          validation={null}
          readiness={executableMissionReadiness}
          onSelectDrone={vi.fn()}
          onCreateMission={vi.fn()}
          onRenameMission={vi.fn()}
          onUploadStart={startSimulation}
        />
        <DemoGuide />
      </>,
    );

    const target = document.querySelector<HTMLButtonElement>(
      '[data-demo-target="start-simulation"]',
    );

    expect(target?.getAttribute('data-demo-active-target')).toBe('true');
    fireEvent.click(target as HTMLButtonElement);

    expect(startSimulation).toHaveBeenCalledTimes(1);
    expect(useDemoGuideStore.getState().step).toBe('FLY');
    expect(useUIStore.getState().currentView).toBe('FLIGHT');
  });

  it('advances from flight observation without triggering a product action', () => {
    render(<DemoGuide />);
    setGuideStep('FLY');
    const currentView = useUIStore.getState().currentView;

    fireEvent.click(screen.getByRole('button', { name: 'Continue to 3D inspection' }));

    expect(useDemoGuideStore.getState().step).toBe('INSPECT');
    expect(useUIStore.getState().currentView).toBe(currentView);
  });

  it.each([
    ['PLAN', '[data-demo-target="start-simulation"]'],
    ['INSPECT', '[data-demo-target="toggle-3d"]'],
    ['REVIEW', '[data-demo-target="open-replay"]'],
  ] as const)('points the %s step at its real product control', (step, target) => {
    render(<DemoGuide />);
    setGuideStep(step);

    expect(screen.getByRole('dialog').getAttribute('data-demo-target-selector')).toBe(target);
  });

  it('advances inspection only when the real 3D control turns 3D on', () => {
    setGuideStep('INSPECT');
    useUIStore.setState({ show3D: false });

    render(
      <>
        <MapToolbar />
        <DemoGuide />
      </>,
    );

    const target = document.querySelector<HTMLButtonElement>(
      '[data-demo-target="toggle-3d"]',
    );

    expect(target?.getAttribute('data-demo-active-target')).toBe('true');
    fireEvent.click(target as HTMLButtonElement);

    expect(useUIStore.getState().show3D).toBe(true);
    expect(useDemoGuideStore.getState().step).toBe('REVIEW');
  });

  it('does not advance inspection when the real 3D control turns 3D off', () => {
    setGuideStep('INSPECT');
    useUIStore.setState({ show3D: true });

    render(<MapToolbar />);

    const target = document.querySelector<HTMLButtonElement>(
      '[data-demo-target="toggle-3d"]',
    );

    fireEvent.click(target as HTMLButtonElement);

    expect(useUIStore.getState().show3D).toBe(false);
    expect(useDemoGuideStore.getState().step).toBe('INSPECT');
  });

  it('restarts the synthetic scenario and returns the guide to welcome', () => {
    setGuideStep('REVIEW');
    render(<DemoBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Restart tour' }));

    expect(resetDemoScenario).toHaveBeenCalledTimes(1);
    expect(useDemoGuideStore.getState().step).toBe('WELCOME');
    expect(useDemoGuideStore.getState().isOpen).toBe(true);
  });

  it('labels and focuses the dialog and provides a skip action', () => {
    render(<DemoGuide />);

    const dialog = screen.getByRole('dialog', { name: 'Welcome to RohuPlanner' });

    expect(document.activeElement).toBe(dialog);

    fireEvent.click(screen.getByRole('button', { name: 'Explore freely' }));

    expect(useDemoGuideStore.getState().step).toBe('FREE');
    expect(useDemoGuideStore.getState().isOpen).toBe(false);
  });

  it('blocks background pointer interaction while welcome is modal', () => {
    render(<DemoGuide />);

    const layer = document.querySelector<HTMLElement>('.demo-guide-layer--welcome');

    expect(layer).not.toBeNull();
    expect(fireEvent.pointerDown(layer as HTMLElement)).toBe(false);
  });

  it('traps welcome focus in both directions and keeps Escape functional', () => {
    render(
      <>
        <button type="button">Background action</button>
        <DemoGuide />
      </>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Welcome to RohuPlanner' });
    const close = screen.getByRole('button', { name: 'Close tour' });
    const explore = screen.getByRole('button', { name: 'Explore freely' });
    const background = screen.getByRole('button', { name: 'Background action' });

    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(explore);

    explore.focus();
    fireEvent.keyDown(explore, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    background.focus();
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
