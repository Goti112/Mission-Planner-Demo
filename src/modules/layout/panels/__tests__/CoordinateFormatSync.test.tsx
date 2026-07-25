import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as mgrs from 'mgrs';
import * as utm from 'utm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLIGHT_TELEMETRY, type FlightTelemetry } from '../../../telemetry';
import { useUIStore } from '../../../../shared/store/uiStore';
import ControlBar from '../ControlBar';
import TelemetryPanelAdvanced from '../TelemetryPanelAdvanced';
import { CoordinatesIndicator } from '../../../hud/instruments/CoordinatesIndicator';
import PFDBottomBar from '../../../hud/PFDBottomBar';
import { CoordinateInput } from '../../../../components/shared/CoordinateInput';

const TEST_LAT = 40.4168;
const TEST_LON = -3.7038;

const telemetryWithCoordinates = (): FlightTelemetry => ({
  ...DEFAULT_FLIGHT_TELEMETRY,
  navigation: {
    ...DEFAULT_FLIGHT_TELEMETRY.navigation,
    latitude: TEST_LAT,
    longitude: TEST_LON,
  },
});

describe('coordinate format synchronization', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root !== null) {
      act(() => root?.unmount());
    }

    root = null;
    container = null;
    useUIStore.setState({ coordinateFormat: 'geo' });
  });

  it('updates the flight telemetry panel when the footer coordinate mode changes', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <>
          <ControlBar droneLat={TEST_LAT} droneLon={TEST_LON} />
          <TelemetryPanelAdvanced telemetry={telemetryWithCoordinates()} />
        </>,
      );
    });

    const selector = container.querySelector('select[aria-label="Coordinate format"]');
    expect(selector).toBeInstanceOf(HTMLSelectElement);

    if (!(selector instanceof HTMLSelectElement)) {
      throw new Error('Coordinate format selector was not rendered.');
    }

    await act(async () => {
      selector.value = 'mgrs';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain(mgrs.forward([TEST_LON, TEST_LAT]));
    expect(container.textContent).not.toContain(TEST_LAT.toFixed(6));
  });

  it('updates CoordinateDisplay consumers when the footer format changes', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <>
          <ControlBar droneLat={TEST_LAT} droneLon={TEST_LON} />
          <CoordinatesIndicator latitude={TEST_LAT} longitude={TEST_LON} />
          <PFDBottomBar telemetry={telemetryWithCoordinates()} normTelemetry={null} />
        </>,
      );
    });

    const selector = container.querySelector('select[aria-label="Coordinate format"]');
    expect(selector).toBeInstanceOf(HTMLSelectElement);

    if (!(selector instanceof HTMLSelectElement)) {
      throw new Error('Coordinate format selector was not rendered.');
    }

    const mgrsValue = mgrs.forward([TEST_LON, TEST_LAT]);

    await act(async () => {
      selector.value = 'mgrs';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain(mgrsValue);
    expect(container.textContent).not.toContain(TEST_LAT.toFixed(6));
    expect(container.textContent).not.toContain(TEST_LON.toFixed(6));

    await act(async () => {
      selector.value = 'utm';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const { zoneNum, zoneLetter } = utm.fromLatLon(TEST_LAT, TEST_LON);

    expect(container.textContent).not.toContain(mgrsValue);
    expect(container.textContent).not.toContain(TEST_LAT.toFixed(6));
    expect(container.textContent).not.toContain(TEST_LON.toFixed(6));
    expect(container.textContent).toContain(`${zoneNum}${zoneLetter}`);
  });

  it('updates CoordinateInput when the footer format changes', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onChange = vi.fn();

    await act(async () => {
      root?.render(
        <>
          <ControlBar droneLat={TEST_LAT} droneLon={TEST_LON} />
          <CoordinateInput latitude={TEST_LAT} longitude={TEST_LON} onChange={onChange} />
        </>,
      );
    });

    const selector = container.querySelector('select[aria-label="Coordinate format"]');
    expect(selector).toBeInstanceOf(HTMLSelectElement);

    if (!(selector instanceof HTMLSelectElement)) {
      throw new Error('Coordinate format selector was not rendered.');
    }

    expect(container.querySelectorAll('input[type="number"]').length).toBe(2);

    await act(async () => {
      selector.value = 'mgrs';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelectorAll('input[type="number"]').length).toBe(0);
    const mgrsInput = container.querySelector('input[type="text"]');
    expect(mgrsInput).toBeInstanceOf(HTMLInputElement);
    expect((mgrsInput as HTMLInputElement).value).toBe(mgrs.forward([TEST_LON, TEST_LAT]));

    await act(async () => {
      selector.value = 'utm';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const utmInput = container.querySelector('input[type="text"]');
    expect(utmInput).toBeInstanceOf(HTMLInputElement);
    expect((utmInput as HTMLInputElement).value).toContain(utm.fromLatLon(TEST_LAT, TEST_LON).zoneLetter);

    await act(async () => {
      selector.value = 'geo';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelectorAll('input[type="number"]').length).toBe(2);
  });
});
