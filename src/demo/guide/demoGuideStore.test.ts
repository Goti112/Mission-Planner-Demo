import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'rohuplanner-demo-guide';

const loadDemoGuideStore = async () => import('./demoGuideStore');

describe('demo guide store', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });

  it('restarts at welcome, skips to free mode, and closes the guide', async () => {
    const { useDemoGuideStore } = await loadDemoGuideStore();

    useDemoGuideStore.getState().advance();
    expect(useDemoGuideStore.getState().step).toBe('PLAN');

    useDemoGuideStore.getState().restart();
    expect(useDemoGuideStore.getState().step).toBe('WELCOME');
    expect(useDemoGuideStore.getState().isOpen).toBe(true);

    useDemoGuideStore.getState().skip();
    expect(useDemoGuideStore.getState().step).toBe('FREE');
    expect(useDemoGuideStore.getState().isOpen).toBe(false);

    useDemoGuideStore.getState().close();
    expect(useDemoGuideStore.getState().isOpen).toBe(false);
  });

  it('rehydrates only the persisted guide step and visibility', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { step: 'INSPECT', isOpen: false }, version: 0 }),
    );

    const { useDemoGuideStore } = await loadDemoGuideStore();

    expect(useDemoGuideStore.getState().step).toBe('INSPECT');
    expect(useDemoGuideStore.getState().isOpen).toBe(false);

    useDemoGuideStore.getState().advance();

    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '')).toEqual({
      state: { step: 'REVIEW', isOpen: false },
      version: 0,
    });
  });

  it('surfaces an invalid persisted step as a state error', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { step: 'NOT_A_STEP', isOpen: true }, version: 0 }),
    );

    await expect(loadDemoGuideStore()).rejects.toMatchObject({
      name: 'DemoGuideStateError',
    });
  });

  it('surfaces malformed persisted state as a state error', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{invalid json');

    await expect(loadDemoGuideStore()).rejects.toMatchObject({
      name: 'DemoGuideStateError',
    });
  });
});
