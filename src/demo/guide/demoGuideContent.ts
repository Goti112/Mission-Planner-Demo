import type { DemoGuideStep } from './demoGuideMachine';

export interface DemoGuideContent {
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
  readonly target: string | null;
}

type GuidedDemoStep = Exclude<DemoGuideStep, 'FREE'>;

export const DEMO_GUIDE_CONTENT: Readonly<Record<GuidedDemoStep, DemoGuideContent>> = {
  WELCOME: {
    title: 'Welcome to RohuPlanner',
    body: 'Understand the prepared synthetic six-point mission before running the simulation.',
    actionLabel: 'Review mission',
    target: null,
  },
  PLAN: {
    title: 'Review the mission plan',
    body: 'Inspect the home position, waypoints, altitude, distance, and mission validation.',
    actionLabel: 'Start simulated mission',
    target: '[data-demo-target="start-simulation"]',
  },
  FLY: {
    title: 'Observe the simulated flight',
    body: 'Start the simulation and observe the map, telemetry, battery, GPS, and mission progress.',
    actionLabel: 'Continue to 3D inspection',
    target: null,
  },
  INSPECT: {
    title: 'Inspect the mission in 3D',
    body: 'Switch to 3D and inspect the trajectory and operational readiness.',
    actionLabel: 'Switch to 3D',
    target: '[data-demo-target="toggle-3d"]',
  },
  REVIEW: {
    title: 'Review recorded telemetry',
    body: 'Open replay and review the recorded route, events, and telemetry.',
    actionLabel: 'Open replay',
    target: '[data-demo-target="open-replay"]',
  },
};
