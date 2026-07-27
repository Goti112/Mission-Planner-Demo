import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DemoGuideStateError,
  advanceDemoGuide,
  parseDemoGuideStep,
} from './demoGuideMachine';
import type { DemoGuideStep } from './demoGuideMachine';

const DEMO_GUIDE_STORAGE_KEY = 'mission-planner-demo-guide';

interface PersistedDemoGuideState {
  readonly step: DemoGuideStep;
  readonly isOpen: boolean;
}

export interface DemoGuideStoreState extends PersistedDemoGuideState {
  readonly advance: () => void;
  readonly restart: () => void;
  readonly skip: () => void;
  readonly close: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePersistedDemoGuideState = (serialized: string): PersistedDemoGuideState => {
  let persisted: unknown;

  try {
    persisted = JSON.parse(serialized);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new DemoGuideStateError(`Invalid persisted demo guide state; value=${serialized}`);
    }

    throw error;
  }

  if (!isRecord(persisted) || !isRecord(persisted.state)) {
    throw new DemoGuideStateError(`Invalid persisted demo guide state; value=${serialized}`);
  }

  const step = parseDemoGuideStep(persisted.state.step);
  const { isOpen } = persisted.state;

  if (typeof isOpen !== 'boolean') {
    throw new DemoGuideStateError(`Invalid persisted demo guide visibility; value=${String(isOpen)}`);
  }

  return { step, isOpen };
};

const loadPersistedDemoGuideState = (): PersistedDemoGuideState => {
  const serialized = sessionStorage.getItem(DEMO_GUIDE_STORAGE_KEY);

  if (serialized === null) {
    return { step: 'WELCOME', isOpen: true };
  }

  return parsePersistedDemoGuideState(serialized);
};

const initialState = loadPersistedDemoGuideState();

export const useDemoGuideStore = create<DemoGuideStoreState>()(
  persist(
    (set) => ({
      ...initialState,
      advance: () => set((state) => ({ step: advanceDemoGuide(state.step) })),
      restart: () => set({ step: 'WELCOME', isOpen: true }),
      skip: () => set({ step: 'FREE', isOpen: false }),
      close: () => set({ isOpen: false }),
    }),
    {
      name: DEMO_GUIDE_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ step: state.step, isOpen: state.isOpen }),
      skipHydration: true,
    },
  ),
);
