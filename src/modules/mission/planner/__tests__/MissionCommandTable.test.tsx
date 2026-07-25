import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';
import * as utm from 'utm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../../shared/store/uiStore';
import type { MissionTableRow } from '../../domain';
import MissionCommandTable from '../MissionCommandTable';

const editableRow = (): MissionTableRow => ({
  id: 'item-1',
  seq: 0,
  command: 'MAV_CMD_NAV_WAYPOINT',
  frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
  param1: 12,
  param2: null,
  param3: null,
  param4: null,
  lat: 40.4168,
  lng: -3.7038,
  alt: 80,
  autocontinue: true,
});

const routeRows = (): readonly MissionTableRow[] => [
  editableRow(),
  {
    ...editableRow(),
    id: 'item-2',
    seq: 1,
    lat: 40.4178,
    lng: -3.7028,
    alt: 100,
  },
];

describe('MissionCommandTable', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root !== null) {
      act(() => root?.unmount());
    }

    root = null;
    container = null;
    useUIStore.setState({ coordinateFormat: 'geo' });
    vi.restoreAllMocks();
  });

  it('edits a parameter inline on double click without selecting the row', async () => {
    const onSelectItem = vi.fn();
    const onUpdateItem = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionCommandTable
          rows={[editableRow()]}
          navCommands={['MAV_CMD_NAV_WAYPOINT', 'MAV_CMD_NAV_LOITER_TIME']}
          selectedItemId={null}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          locked={false}
          sourceSelectionEnabled={false}
          selectedSourceItemIds={[]}
          onSelectItem={onSelectItem}
          onToggleSourceItem={vi.fn()}
          onChangeItemCommand={vi.fn()}
          onUpdateItem={onUpdateItem}
          onRemoveItem={vi.fn()}
          onReorderItem={vi.fn()}
        />,
      );
    });

    const editCell = container.querySelector('[aria-label="Edit P1 for command 1"]');
    expect(editCell).toBeInstanceOf(HTMLTableCellElement);

    await act(async () => {
      editCell?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    const input = container.querySelector('input[aria-label="P1 value for command 1"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Inline P1 input was not rendered.');
    }

    await act(async () => {
      input.value = '15.5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSelectItem).not.toHaveBeenCalled();
    expect(onUpdateItem).toHaveBeenCalledWith('item-1', {
      params: [15.5, null, null, null, 40.4168, -3.7038, 80],
    });
  });

  it('shows Mission Planner flight-plan columns and command row metrics without duplicate lat lng columns', async () => {
    const onRemoveItem = vi.fn();
    const onReorderItem = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionCommandTable
          rows={routeRows()}
          navCommands={['MAV_CMD_NAV_WAYPOINT', 'MAV_CMD_NAV_LOITER_TIME']}
          selectedItemId={null}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          locked={false}
          sourceSelectionEnabled={false}
          selectedSourceItemIds={[]}
          onSelectItem={vi.fn()}
          onToggleSourceItem={vi.fn()}
          onChangeItemCommand={vi.fn()}
          onUpdateItem={vi.fn()}
          onRemoveItem={onRemoveItem}
          onReorderItem={onReorderItem}
        />,
      );
    });

    const tableText = container.textContent ?? '';
    const headerTexts = Array.from(container.querySelectorAll('th')).map((header) => header.textContent ?? '');
    expect(tableText).toContain('Comandos');
    expect(tableText).toContain('GEO');
    expect(tableText).toContain('Borrar');
    expect(tableText).toContain('Grad %');
    expect(tableText).toContain('Angle');
    expect(tableText).toContain('Dist');
    expect(tableText).toContain('AZ');
    expect(headerTexts).not.toContain('Lat');
    expect(headerTexts).not.toContain('Lng');
    expect(headerTexts).not.toContain('Frame');
    expect(tableText).not.toContain('Lat');
    expect(tableText).not.toContain('Lng');
    expect(container.querySelector('input[aria-label="Lat"]')).toBeInstanceOf(HTMLInputElement);
    expect(container.querySelector('input[aria-label="Lng"]')).toBeInstanceOf(HTMLInputElement);
    expect(tableText).toContain('100 m');
    expect(tableText).not.toContain('Auto');
    expect(tableText).not.toContain('Issue');
    expect(tableText).not.toContain('Arrib');
    expect(tableText).not.toContain('Abaj');
    expect(container.querySelector('[aria-label="Move command 2 up"]')).toBeNull();
    expect(container.querySelector('[aria-label="Move command 1 down"]')).toBeNull();
    expect(onReorderItem).not.toHaveBeenCalled();

    const removeButton = container.querySelector('[aria-label="Remove command 2"]');
    expect(removeButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRemoveItem).toHaveBeenCalledWith('item-2');
  });

  it('edits coordinates from the right GEO coordinate column', async () => {
    const onUpdateItem = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionCommandTable
          rows={[editableRow()]}
          navCommands={['MAV_CMD_NAV_WAYPOINT', 'MAV_CMD_NAV_LOITER_TIME']}
          selectedItemId={null}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          locked={false}
          sourceSelectionEnabled={false}
          selectedSourceItemIds={[]}
          onSelectItem={vi.fn()}
          onToggleSourceItem={vi.fn()}
          onChangeItemCommand={vi.fn()}
          onUpdateItem={onUpdateItem}
          onRemoveItem={vi.fn()}
          onReorderItem={vi.fn()}
        />,
      );
    });

    const latInput = container.querySelector('input[aria-label="Lat"]');
    const lngInput = container.querySelector('input[aria-label="Lng"]');
    expect(latInput).toBeInstanceOf(HTMLInputElement);
    expect(lngInput).toBeInstanceOf(HTMLInputElement);

    if (!(latInput instanceof HTMLInputElement) || !(lngInput instanceof HTMLInputElement)) {
      throw new Error('Right GEO coordinate inputs were not rendered.');
    }

    await act(async () => {
      fireEvent.change(latInput, { target: { value: '40.5' } });
      fireEvent.change(lngInput, { target: { value: '-3.9' } });
      fireEvent.keyDown(lngInput, { key: 'Enter' });
    });

    expect(onUpdateItem).toHaveBeenCalledWith('item-1', {
      coordinate: {
        lat: 40.5,
        lng: -3.9,
        alt: 80,
      },
    });
  });

  it('edits coordinates from the right UTM coordinate column without a left Coords column', async () => {
    const utmCoordinate = utm.fromLatLon(40.4168, -3.7038);
    const onUpdateItem = vi.fn();
    useUIStore.setState({ coordinateFormat: 'utm' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionCommandTable
          rows={routeRows()}
          navCommands={['MAV_CMD_NAV_WAYPOINT', 'MAV_CMD_NAV_LOITER_TIME']}
          selectedItemId={null}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          locked={false}
          sourceSelectionEnabled={false}
          selectedSourceItemIds={[]}
          onSelectItem={vi.fn()}
          onToggleSourceItem={vi.fn()}
          onChangeItemCommand={vi.fn()}
          onUpdateItem={onUpdateItem}
          onRemoveItem={vi.fn()}
          onReorderItem={vi.fn()}
        />,
      );
    });

    const tableText = container.textContent ?? '';
    const headerTexts = Array.from(container.querySelectorAll('th')).map((header) => header.textContent ?? '');
    const utmInput = container.querySelector('input[aria-label="UTM"]');
    const utmLabelCount = tableText.match(/UTM/g)?.length ?? 0;

    expect(tableText).toContain('UTM');
    expect(utmLabelCount).toBe(1);
    expect(headerTexts).not.toContain('Coords');
    expect(utmInput).toBeInstanceOf(HTMLInputElement);

    if (!(utmInput instanceof HTMLInputElement)) {
      throw new Error('Right UTM coordinate input was not rendered.');
    }

    expect(utmInput.value).toBe(
      `${utmCoordinate.zoneNum}${utmCoordinate.zoneLetter} ${utmCoordinate.easting.toFixed(0)} ${utmCoordinate.northing.toFixed(0)}`,
    );

    await act(async () => {
      fireEvent.change(utmInput, { target: { value: '30T 440290 4474257' } });
      fireEvent.blur(utmInput);
    });

    expect(onUpdateItem).toHaveBeenCalledTimes(1);
    const patch = onUpdateItem.mock.calls[0][1];
    expect(onUpdateItem.mock.calls[0][0]).toBe('item-1');
    expect(patch.coordinate.alt).toBe(80);
    expect(patch.coordinate.lat).toBeCloseTo(40.4168, 3);
    expect(patch.coordinate.lng).toBeCloseTo(-3.7038, 3);
    expect(tableText).not.toContain('MGRS');
    expect(tableText).not.toContain('30TVK');
  });

  it('toggles an advanced layer source item without selecting the row', async () => {
    const onSelectItem = vi.fn();
    const onToggleSourceItem = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionCommandTable
          rows={[{ ...editableRow(), id: 'wp-1' }]}
          navCommands={['MAV_CMD_NAV_WAYPOINT', 'MAV_CMD_NAV_LOITER_TIME']}
          selectedItemId={null}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          locked={false}
          sourceSelectionEnabled={true}
          selectedSourceItemIds={[]}
          onSelectItem={onSelectItem}
          onToggleSourceItem={onToggleSourceItem}
          onChangeItemCommand={vi.fn()}
          onUpdateItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onReorderItem={vi.fn()}
        />,
      );
    });

    const sourceCheckbox = container.querySelector(
      'input[aria-label="Use command 1 as advanced layer source"]',
    );
    expect(sourceCheckbox).toBeInstanceOf(HTMLInputElement);

    await act(async () => {
      sourceCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleSourceItem).toHaveBeenCalledWith('wp-1');
    expect(onSelectItem).not.toHaveBeenCalled();
  });

  it('does not start row reorder from the advanced layer source checkbox', async () => {
    const onReorderItem = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionCommandTable
          rows={[{ ...editableRow(), id: 'wp-1' }]}
          navCommands={['MAV_CMD_NAV_WAYPOINT', 'MAV_CMD_NAV_LOITER_TIME']}
          selectedItemId={null}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          locked={false}
          sourceSelectionEnabled={true}
          selectedSourceItemIds={[]}
          onSelectItem={vi.fn()}
          onToggleSourceItem={vi.fn()}
          onChangeItemCommand={vi.fn()}
          onUpdateItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onReorderItem={onReorderItem}
        />,
      );
    });

    const sourceCheckbox = container.querySelector(
      'input[aria-label="Use command 1 as advanced layer source"]',
    );
    expect(sourceCheckbox).toBeInstanceOf(HTMLInputElement);

    await act(async () => {
      sourceCheckbox?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    });

    expect(onReorderItem).not.toHaveBeenCalled();
  });
});
