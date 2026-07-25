import { describe, expect, it } from 'vitest';

import {
  DemoGuideStateError,
  advanceDemoGuide,
  parseDemoGuideStep,
} from './demoGuideMachine';

describe('demo guide machine', () => {
  it('advances through the guided scenario and remains free afterwards', () => {
    expect(advanceDemoGuide('WELCOME')).toBe('PLAN');
    expect(advanceDemoGuide('PLAN')).toBe('FLY');
    expect(advanceDemoGuide('FLY')).toBe('INSPECT');
    expect(advanceDemoGuide('INSPECT')).toBe('REVIEW');
    expect(advanceDemoGuide('REVIEW')).toBe('FREE');
    expect(advanceDemoGuide('FREE')).toBe('FREE');
  });

  it('rejects an invalid persisted step', () => {
    expect(() => parseDemoGuideStep('UNKNOWN')).toThrow(DemoGuideStateError);
  });
});
