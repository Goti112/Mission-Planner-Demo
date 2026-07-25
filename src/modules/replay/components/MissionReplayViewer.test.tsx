import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFlightRecorderStore } from '../store/flightRecorderStore';
import MissionReplayViewer from './MissionReplayViewer';

describe('MissionReplayViewer', () => {
  beforeEach(() => {
    useFlightRecorderStore.getState().clearAll();
  });

  it('exposes the replay workspace as a named region without recorded data', () => {
    render(<MissionReplayViewer />);

    expect(screen.getByRole('region', { name: 'Mission replay' })).toBeTruthy();
  });
});
