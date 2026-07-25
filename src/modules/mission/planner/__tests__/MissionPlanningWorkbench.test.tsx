import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMissionItem } from '../../domain';
import { useAdvancedLayerUiStore } from '../advancedLayerUiStore';
import { useMissionPlanStore } from '../missionPlanStore';
import MissionPlanningWorkbench from '../MissionPlanningWorkbench';

const resetMissionPlanStore = (): void => {
  useMissionPlanStore.setState({
    missions: {},
    selectedDroneId: null,
    selectedMissionId: null,
    selectedItemId: null,
  });
};

const resetAdvancedLayerUiStore = (): void => {
  useAdvancedLayerUiStore.getState().resetAdvancedLayerUi();
};

describe('MissionPlanningWorkbench command panel', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root !== null) {
      act(() => root?.unmount());
    }

    root = null;
    container = null;
    resetMissionPlanStore();
    resetAdvancedLayerUiStore();
  });

  it('does not render the right-side command selection panel', async () => {
    resetMissionPlanStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionPlanningWorkbench
          selectedDroneId="drone-1"
          droneOptions={[{ id: 'drone-1', name: 'Drone 1' }]}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          map={<div>Map surface</div>}
          onStartExecution={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onSelectedItemChange={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[aria-label="Mission item inspector"]')).toBeNull();
    expect(container.textContent).not.toContain('Select command');
    expect(container.textContent).not.toContain('Open command panel');
  });

  it('resizes the command table and readiness panel split independently', async () => {
    resetMissionPlanStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionPlanningWorkbench
          selectedDroneId="drone-1"
          droneOptions={[{ id: 'drone-1', name: 'Drone 1' }]}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          map={<div>Map surface</div>}
          onStartExecution={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onSelectedItemChange={vi.fn()}
        />,
      );
    });

    const bottomBand = container.querySelector<HTMLDivElement>('.mp-bottom-band');
    const splitResizeButton = container.querySelector<HTMLButtonElement>('[aria-label="Resize command table and readiness panel"]');

    expect(bottomBand).toBeInstanceOf(HTMLDivElement);
    expect(splitResizeButton).toBeInstanceOf(HTMLButtonElement);

    if (!(bottomBand instanceof HTMLDivElement) || !(splitResizeButton instanceof HTMLButtonElement)) {
      throw new Error('Expected bottom split resize controls to render.');
    }

    Object.defineProperty(bottomBand, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 900,
        height: 192,
        top: 0,
        right: 900,
        bottom: 192,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      splitResizeButton.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 580,
        pointerId: 1,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 500,
        pointerId: 1,
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
      }));
    });

    expect(bottomBand.style.gridTemplateColumns).toContain('400px');
  });

  it('groups loiter commands behind one left-panel command entry', async () => {
    resetMissionPlanStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionPlanningWorkbench
          selectedDroneId="drone-1"
          droneOptions={[{ id: 'drone-1', name: 'Drone 1' }]}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          map={<div>Map surface</div>}
          onStartExecution={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onSelectedItemChange={vi.fn()}
        />,
      );
    });

    const toolbox = container.querySelector('[aria-label="Mission command toolbox"]');
    expect(toolbox).toBeInstanceOf(HTMLElement);

    if (!(toolbox instanceof HTMLElement)) {
      throw new Error('Expected the left mission command toolbox to render.');
    }

    const loiterGroupButton = toolbox.querySelector<HTMLButtonElement>(
      '[aria-label="Open Nav loiter command choices"]',
    );
    expect(loiterGroupButton).toBeInstanceOf(HTMLButtonElement);
    expect(toolbox.textContent).toContain('Loiter');
    expect(toolbox.textContent).not.toContain('Loiter Unlimited');
    expect(toolbox.textContent).not.toContain('Loiter Turns');
    expect(toolbox.textContent).not.toContain('Loiter Time');

    await act(async () => {
      loiterGroupButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const loiterChoices = toolbox.querySelector('[aria-label="Nav loiter command choices"]');
    expect(loiterChoices).toBeInstanceOf(HTMLDivElement);
    expect(loiterChoices?.textContent).toContain('Loiter Unlimited');
    expect(loiterChoices?.textContent).toContain('Loiter Turns');
    expect(loiterChoices?.textContent).toContain('Loiter Time');

    const loiterTurnsButton = toolbox.querySelector<HTMLButtonElement>(
      '[aria-label="Add Loiter Turns command"]',
    );

    await act(async () => {
      loiterTurnsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const missionId = useMissionPlanStore.getState().selectedMissionId;
    if (missionId === null) {
      throw new Error('Expected a selected mission after adding a loiter command.');
    }

    const addedItem = useMissionPlanStore.getState().missions[missionId]?.plan.items[0];
    expect(addedItem?.command).toBe('MAV_CMD_NAV_LOITER_TURNS');
  });

  it('changes a nav command from the bottom command table using default mission item logic', async () => {
    resetMissionPlanStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionPlanningWorkbench
          selectedDroneId="drone-1"
          droneOptions={[{ id: 'drone-1', name: 'Drone 1' }]}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          map={<div>Map surface</div>}
          onStartExecution={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onSelectedItemChange={vi.fn()}
        />,
      );
    });

    const missionId = useMissionPlanStore.getState().selectedMissionId;
    if (missionId === null) {
      throw new Error('Expected a selected mission for nav command change test.');
    }

    await act(async () => {
      useMissionPlanStore.getState().addItem(
        missionId,
        createMissionItem({
          id: 'command-change-wp-1',
          seq: 0,
          command: 'MAV_CMD_NAV_WAYPOINT',
          frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
          current: true,
          autocontinue: true,
          params: [0, 0, 0, 0, 40.4168, -3.7038, 80],
          coordinate: { lat: 40.4168, lng: -3.7038, alt: 80 },
        }),
        null,
      );
    });

    const commandButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Change nav command for command 1"]',
    );
    expect(commandButton).toBeInstanceOf(HTMLButtonElement);

    if (!(commandButton instanceof HTMLButtonElement)) {
      throw new Error('Expected bottom command table nav command picker to render.');
    }

    await act(async () => {
      commandButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const commandChoices = container.querySelector('[aria-label="Nav command choices for command 1"]');
    expect(commandChoices).toBeInstanceOf(HTMLDivElement);

    if (!(commandChoices instanceof HTMLDivElement)) {
      throw new Error('Expected bottom command table nav command choices to render.');
    }

    expect(commandChoices.textContent).toContain('Loiter Unlimited');
    expect(commandChoices.textContent).toContain('Loiter Turns');
    expect(commandChoices.textContent).toContain('Loiter Time');

    await act(async () => {
      const loiterTimeButton = container?.querySelector<HTMLButtonElement>(
        '[aria-label="Change command 1 to Loiter Time"]',
      );

      if (!(loiterTimeButton instanceof HTMLButtonElement)) {
        throw new Error('Expected loiter time command choice to render.');
      }

      loiterTimeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const updatedItem = useMissionPlanStore.getState().missions[missionId]?.plan.items[0];
    expect(updatedItem).toEqual(
      expect.objectContaining({
        id: 'command-change-wp-1',
        seq: 0,
        command: 'MAV_CMD_NAV_LOITER_TIME',
        frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
        current: true,
        autocontinue: true,
        params: [30, null, null, null, 40.4168, -3.7038, 80],
        coordinate: { lat: 40.4168, lng: -3.7038, alt: 80 },
      }),
    );
  });

  it('enables waypoint source selection for the Survey source tool', async () => {
    resetMissionPlanStore();
    resetAdvancedLayerUiStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MissionPlanningWorkbench
          selectedDroneId="drone-1"
          droneOptions={[{ id: 'drone-1', name: 'Drone 1' }]}
          defaultCoordinate={{ lat: 40, lng: -3, alt: 60 }}
          map={<div>Map surface</div>}
          onStartExecution={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onSelectedItemChange={vi.fn()}
        />,
      );
    });

    const missionId = useMissionPlanStore.getState().selectedMissionId;
    if (missionId === null) {
      throw new Error('Expected a selected mission for survey source selection test.');
    }

    await act(async () => {
      useMissionPlanStore.getState().addItem(
        missionId,
        createMissionItem({
          id: 'survey-source-wp-1',
          seq: 0,
          command: 'MAV_CMD_NAV_WAYPOINT',
          frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
          current: true,
          autocontinue: true,
          params: [0, 0, 0, 0, 40.4168, -3.7038, 80],
          coordinate: { lat: 40.4168, lng: -3.7038, alt: 80 },
        }),
        null,
      );
      useAdvancedLayerUiStore.getState().setActiveAdvancedTool('selectSurveySource');
    });

    const sourceCheckbox = container.querySelector<HTMLInputElement>(
      '[aria-label="Use command 1 as advanced layer source"]',
    );
    expect(sourceCheckbox).toBeInstanceOf(HTMLInputElement);

    if (!(sourceCheckbox instanceof HTMLInputElement)) {
      throw new Error('Expected Survey source selection checkbox to render.');
    }

    await act(async () => {
      sourceCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useAdvancedLayerUiStore.getState().selectedSourceMissionItemIds).toEqual(['survey-source-wp-1']);
  });
});
