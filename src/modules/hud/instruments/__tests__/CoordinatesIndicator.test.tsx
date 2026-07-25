import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoordinatesIndicator } from '../CoordinatesIndicator';
import { useUIStore } from '../../../../shared/store/uiStore';

const setFormat = (format: 'geo' | 'mgrs' | 'utm') => {
  useUIStore.setState({ coordinateFormat: format });
};

describe('CoordinatesIndicator', () => {
  it('renders mgrs when footer format is mgrs', () => {
    setFormat('mgrs');
    render(<CoordinatesIndicator latitude={40.4168} longitude={-3.7038} />);
    expect(screen.getByText('30TVK4029074257')).toBeTruthy();
  });

  it('renders lat/lng in geo format', () => {
    setFormat('geo');
    render(<CoordinatesIndicator latitude={40.4168} longitude={-3.7038} />);
    expect(screen.getByText('40.416800')).toBeTruthy();
    expect(screen.getByText('-3.703800')).toBeTruthy();
  });
});
