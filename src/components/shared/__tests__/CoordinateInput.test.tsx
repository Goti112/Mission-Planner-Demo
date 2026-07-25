import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoordinateInput } from '../CoordinateInput';
import { useUIStore } from '../../../shared/store/uiStore';

const setFormat = (format: 'geo' | 'mgrs' | 'utm') => {
  useUIStore.setState({ coordinateFormat: format });
};

describe('CoordinateInput', () => {
  it('edits geo lat/lng and calls onChange on Enter', () => {
    setFormat('geo');
    const onChange = vi.fn();
    render(<CoordinateInput latitude={0} longitude={0} onChange={onChange} />);

    const latInput = screen.getByLabelText('Lat');
    const lngInput = screen.getByLabelText('Lng');

    fireEvent.change(latInput, { target: { value: '40.4168' } });
    fireEvent.change(lngInput, { target: { value: '-3.7038' } });
    fireEvent.keyDown(lngInput, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ lat: 40.4168, lng: -3.7038 });
  });

  it('edits geo lat/lng and calls onChange on blur', () => {
    setFormat('geo');
    const onChange = vi.fn();
    render(<CoordinateInput latitude={0} longitude={0} onChange={onChange} />);

    const latInput = screen.getByLabelText('Lat');
    const lngInput = screen.getByLabelText('Lng');

    fireEvent.change(latInput, { target: { value: '40.4168' } });
    fireEvent.change(lngInput, { target: { value: '-3.7038' } });
    fireEvent.blur(lngInput);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ lat: 40.4168, lng: -3.7038 });
  });

  it('edits mgrs and calls onChange', () => {
    setFormat('mgrs');
    const onChange = vi.fn();
    render(<CoordinateInput latitude={0} longitude={0} onChange={onChange} />);

    const input = screen.getByLabelText('Coords');
    fireEvent.change(input, { target: { value: '30TVK4029074257' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.lat).toBeCloseTo(40.4168, 3);
    expect(call.lng).toBeCloseTo(-3.7038, 3);
  });

  it('edits utm and calls onChange', () => {
    setFormat('utm');
    const onChange = vi.fn();
    render(<CoordinateInput latitude={0} longitude={0} onChange={onChange} />);

    const input = screen.getByLabelText('Coords');
    fireEvent.change(input, { target: { value: '30T 440290 4474257' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalled();
  });

  it('shows error and does not call onChange for invalid mgrs', () => {
    setFormat('mgrs');
    const onChange = vi.fn();
    render(<CoordinateInput latitude={0} longitude={0} onChange={onChange} />);

    const input = screen.getByLabelText('Coords');
    fireEvent.change(input, { target: { value: 'INVALID' } });
    fireEvent.blur(input);

    expect(input.classList.contains('coordinate-input--error')).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels edit on escape', () => {
    setFormat('mgrs');
    const onChange = vi.fn();
    render(<CoordinateInput latitude={40.4168} longitude={-3.7038} onChange={onChange} />);

    const input = screen.getByLabelText('Coords');
    fireEvent.change(input, { target: { value: 'CHANGED' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.getAttribute('value')).not.toBe('CHANGED');
    expect(onChange).not.toHaveBeenCalled();
  });
});
