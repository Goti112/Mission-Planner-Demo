export const DEMO_GUIDE_STEPS = ['WELCOME', 'PLAN', 'FLY', 'INSPECT', 'REVIEW', 'FREE'] as const;

export type DemoGuideStep = (typeof DEMO_GUIDE_STEPS)[number];

export class DemoGuideStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoGuideStateError';
  }
}

const nextStep: Readonly<Record<DemoGuideStep, DemoGuideStep>> = {
  WELCOME: 'PLAN',
  PLAN: 'FLY',
  FLY: 'INSPECT',
  INSPECT: 'REVIEW',
  REVIEW: 'FREE',
  FREE: 'FREE',
};

export const advanceDemoGuide = (step: DemoGuideStep): DemoGuideStep => nextStep[step];

export const parseDemoGuideStep = (value: unknown): DemoGuideStep => {
  if (typeof value !== 'string' || !DEMO_GUIDE_STEPS.includes(value as DemoGuideStep)) {
    throw new DemoGuideStateError(`Invalid persisted demo guide step; value=${String(value)}`);
  }

  return value as DemoGuideStep;
};
