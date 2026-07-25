import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoordinateDisplay } from '../CoordinateDisplay';
import { useUIStore } from '../../../shared/store/uiStore';

const setFormat = (format: 'geo' | 'mgrs' | 'utm') => {
  useUIStore.setState({ coordinateFormat: format });
};

describe('CoordinateDisplay', () => {
  it('renders lat/lng in geo format', () => {
    setFormat('geo');
    render(<CoordinateDisplay latitude={40.4168} longitude={-3.7038} />);
    expect(screen.getByText('40.416800')).toBeTruthy();
    expect(screen.getByText('-3.703800')).toBeTruthy();
  });

  it('renders mgrs when format is mgrs', () => {
    setFormat('mgrs');
    render(<CoordinateDisplay latitude={40.4168} longitude={-3.7038} />);
    expect(screen.getByText('30TVK4029074257')).toBeTruthy();
  });

  it('renders utm when format is utm', () => {
    setFormat('utm');
    render(<CoordinateDisplay latitude={40.4168} longitude={-3.7038} />);
    expect(screen.getByText(/30T \d+ \d+/)).toBeTruthy();
  });

  it('shows placeholder when coordinates are invalid', () => {
    setFormat('geo');
    render(<CoordinateDisplay latitude={Number.NaN} longitude={Number.NaN} />);
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(1);
  });
});
