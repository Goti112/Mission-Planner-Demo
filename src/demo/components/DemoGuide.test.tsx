import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUIStore } from '../../shared/store/uiStore';
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
});
