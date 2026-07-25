import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MissionPlan } from '../../domain';
import type { AdvancedMapPolygonDraft } from '../advancedMapPlacement';
import type { AdvancedMissionPlan, SurveyGridSpec } from '../advancedMissionTypes';
import AdvancedMissionPanel from '../AdvancedMissionPanel';

const advancedPlan = (): AdvancedMissionPlan => ({
  fences: [
    {
      id: 'fence-1',
      name: 'Site Fence',
      shape: 'polygon',
      boundary: 'inclusion',
      vertices: [
        { lat: 40.416, lng: -3.704 },
        { lat: 40.416, lng: -3.702 },
        { lat: 40.418, lng: -3.702 },
      ],
      minAltitudeM: null,
      maxAltitudeM: 120,
    },
  ],
  rallyPoints: [
    {
      id: 'rally-1',
      name: 'North Rally',
      coordinate: { lat: 40.419, lng: -3.705, alt: 60 },
      loiterAltitudeM: 80,
      breakAltitudeM: 40,
      landHeadingDeg: null,
    },
  ],
  surveys: [],
});

const selectedWaypointPlan = (): MissionPlan => ({
  id: 'mission-1',
  vehicleType: 'copter',
  home: null,
  updatedAtIso: '2026-06-11T00:00:00.000Z',
  items: [
    {
      id: 'wp-1',
      seq: 0,
      command: 'MAV_CMD_NAV_WAYPOINT',
      frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      current: true,
      autocontinue: true,
      params: [0, null, null, null, null, null, null],
      coordinate: { lat: 40.416, lng: -3.704, alt: 60 },
    },
    {
      id: 'wp-2',
      seq: 1,
      command: 'MAV_CMD_NAV_WAYPOINT',
      frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      current: false,
      autocontinue: true,
      params: [0, null, null, null, null, null, null],
      coordinate: { lat: 40.417, lng: -3.703, alt: 60 },
    },
    {
      id: 'wp-3',
      seq: 2,
      command: 'MAV_CMD_NAV_WAYPOINT',
      frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      current: false,
      autocontinue: true,
      params: [0, null, null, null, null, null, null],
      coordinate: { lat: 40.418, lng: -3.705, alt: 60 },
    },
  ],
});

const clickPanelTab = async (container: HTMLDivElement, label: string): Promise<void> => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label);

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Advanced panel tab ${label} was not rendered.`);
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const changeFormValue = async (
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): Promise<void> => {
  await act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter === undefined) {
      throw new Error('Expected form element value setter to exist.');
    }

    valueSetter.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};

const StatefulSurveyPanel = (): ReactElement => {
  const [advanced, setAdvanced] = useState<AdvancedMissionPlan>({ fences: [], rallyPoints: [], surveys: [] });
  const [mapPolygonDraft, setMapPolygonDraft] = useState<AdvancedMapPolygonDraft | null>({
    purpose: 'survey' as const,
    id: 'survey-draft-1',
    vertices: [
      { lat: 40.416, lng: -3.704 },
      { lat: 40.417, lng: -3.703 },
      { lat: 40.418, lng: -3.705 },
    ],
  });

  const addSurvey = (_missionId: string, survey: SurveyGridSpec): void => {
    setAdvanced((current): AdvancedMissionPlan => ({
      ...current,
      surveys: [...current.surveys, survey],
    }));
  };

  const updateSurvey = (
    _missionId: string,
    surveyId: string,
    patch: Partial<Omit<SurveyGridSpec, 'id'>>,
  ): void => {
    setAdvanced((current): AdvancedMissionPlan => ({
      ...current,
      surveys: current.surveys.map((survey): SurveyGridSpec => (survey.id === surveyId ? { ...survey, ...patch } : survey)),
    }));
  };

  return (
    <AdvancedMissionPanel
      missionId="mission-1"
      plan={selectedWaypointPlan()}
      advanced={advanced}
      defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
      locked={false}
      selectedSourceMissionItemIds={[]}
      activeAdvancedTool="drawSurveyPolygon"
      onSetAdvancedTool={vi.fn()}
      onClearSourceMissionItems={vi.fn()}
      onAddFence={vi.fn()}
      onUpdateFence={vi.fn()}
      onRemoveFence={vi.fn()}
      onAddRallyPoint={vi.fn()}
      onUpdateRallyPoint={vi.fn()}
      onRemoveRallyPoint={vi.fn()}
      onAddSurvey={addSurvey}
      onUpdateSurvey={updateSurvey}
      onRemoveSurvey={vi.fn()}
      onAppendMissionItems={vi.fn()}
      onExportMissionJson={vi.fn()}
      onImportMissionJson={vi.fn()}
      onMinimize={vi.fn()}
      mapPolygonDraft={mapPolygonDraft}
      setMapPolygonDraft={setMapPolygonDraft}
      pinned={false}
      panelStyle={undefined}
      onTogglePin={vi.fn()}
      onPanelDragStart={vi.fn()}
    />
  );
};

describe('AdvancedMissionPanel', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root !== null) {
      act(() => root?.unmount());
    }

    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it('opens without selecting an advanced mode by default', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Fence');
    expect(container.textContent).toContain('Rally');
    expect(container.textContent).toContain('Survey');
    expect(container.textContent).toContain('I/O');
    expect(container.textContent).not.toContain('Place Fence');
    expect(container.textContent).not.toContain('No fences created yet.');
    expect(container.querySelector('[aria-label="Fence placement"]')).toBeNull();
    expect(container.querySelector('textarea.mp-textarea')).toBeNull();
    expect(container.textContent).not.toContain('Save');
    expect(container.querySelector('[aria-selected="true"]')).toBeNull();
  });

  it('toggles advanced mode tabs on and off', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    expect(container.textContent).toContain('Place Fence');
    expect(container.querySelector('[aria-label="Fence placement"]')).toBeInstanceOf(HTMLElement);
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toContain('Fence');

    await clickPanelTab(container, 'Fence');

    expect(container.textContent).not.toContain('Place Fence');
    expect(container.querySelector('[aria-label="Fence placement"]')).toBeNull();
    expect(container.querySelector('[aria-selected="true"]')).toBeNull();
  });

  it('keeps placement buttons gray until their tool is marked active', async () => {
    const onSetAdvancedTool = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={advancedPlan()}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={onSetAdvancedTool}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    const inactiveButton = container.querySelector<HTMLButtonElement>('[aria-label="Place fence vertices on map"]');

    if (inactiveButton === null) {
      throw new Error('Place fence button was not rendered.');
    }

    expect(inactiveButton.className).toBe('mp-button mp-button--toggle');
    expect(inactiveButton.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      inactiveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSetAdvancedTool).toHaveBeenCalledWith('drawFencePolygon');

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={advancedPlan()}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="drawFencePolygon"
          onSetAdvancedTool={onSetAdvancedTool}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    const activeButton = container.querySelector<HTMLButtonElement>('[aria-label="Place fence vertices on map"]');

    if (activeButton === null) {
      throw new Error('Active place fence button was not rendered.');
    }

    expect(activeButton.className).toBe('mp-button mp-button--toggle mp-button--active');
    expect(activeButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows Mission Planner style upload preview for saved fence and rally items', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={advancedPlan()}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    expect(container.textContent).not.toContain('ArduPilot upload');

    await clickPanelTab(container, 'I/O');

    const text = container.textContent ?? '';
    expect(text).toContain('ArduPilot upload');
    expect(text).toContain('4 commands ready');
    expect(text).toContain('FENCE_POLYGON_VERTEX_INCLUSION');
    expect(text).toContain('RALLY_POINT');

    const prepareButton = container.querySelector('[aria-label="Prepare ArduPilot fence and rally upload"]');
    expect(prepareButton).toBeInstanceOf(HTMLButtonElement);
  });

  it('prepares QGC WPL rows when the ArduPilot upload action is clicked', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={advancedPlan()}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'I/O');

    const prepareButton = container.querySelector('[aria-label="Prepare ArduPilot fence and rally upload"]');

    await act(async () => {
      prepareButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textArea = container.querySelector('textarea.mp-textarea--io');
    expect(textArea).toBeInstanceOf(HTMLTextAreaElement);

    if (!(textArea instanceof HTMLTextAreaElement)) {
      throw new Error('Advanced upload textarea was not rendered.');
    }

    expect(textArea.value).toContain('QGC WPL 110');
    expect(textArea.value).toContain('\t5001\t');
    expect(textArea.value).toContain('\t5100\t');
    expect(container.textContent).toContain('4 ArduPilot fence/rally commands prepared.');
  });

  it('exports mission JSON from the I/O tab', async () => {
    const onExportMissionJson = vi.fn(() => '{"version":1,"mission":{"name":"Survey mission"}}');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={selectedWaypointPlan()}
          advanced={advancedPlan()}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={onExportMissionJson}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'I/O');

    const exportButton = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === 'Export');

    if (!(exportButton instanceof HTMLButtonElement)) {
      throw new Error('Mission I/O export button was not rendered.');
    }

    await act(async () => {
      exportButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textArea = container.querySelector('textarea.mp-textarea--io');
    expect(textArea).toBeInstanceOf(HTMLTextAreaElement);

    if (!(textArea instanceof HTMLTextAreaElement)) {
      throw new Error('Mission I/O textarea was not rendered.');
    }

    expect(onExportMissionJson).toHaveBeenCalledWith('mission-1');
    expect(textArea.value).toContain('Survey mission');
  });

  it('creates a polygon fence from selected mission waypoints when Create fence is pressed', async () => {
    const onAddFence = vi.fn();
    const onClearSourceMissionItems = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={selectedWaypointPlan()}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={['wp-1', 'wp-2', 'wp-3']}
          activeAdvancedTool="selectFenceSource"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={onClearSourceMissionItems}
          onAddFence={onAddFence}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    expect(container.textContent).toContain('3 waypoints selected - ready to create');

    const button = container.querySelector<HTMLButtonElement>('[aria-label="Create fence from draft"]');

    if (button === null) {
      throw new Error('Create fence button was not rendered.');
    }

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddFence).toHaveBeenCalledWith(
      'mission-1',
      expect.objectContaining({
        name: 'Fence 1',
        shape: 'polygon',
        boundary: 'inclusion',
        maxAltitudeM: 120,
        minAltitudeM: null,
        vertices: [
          { lat: 40.416, lng: -3.704 },
          { lat: 40.417, lng: -3.703 },
          { lat: 40.418, lng: -3.705 },
        ],
      }),
    );
    expect(onClearSourceMissionItems).toHaveBeenCalledOnce();
  });

  it('offers Survey draw area, waypoint selection, and manual coordinates without opening a form by default', async () => {
    const onSetAdvancedTool = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={selectedWaypointPlan()}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={onSetAdvancedTool}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Survey');

    expect(container.textContent).toContain('Draw area');
    expect(container.textContent).toContain('Select WPs');
    expect(container.textContent).toContain('Manual coordinates');
    expect(container.textContent).toContain('No surveys created yet.');
    expect(container.querySelector('textarea.mp-textarea')).toBeNull();
    expect(container.textContent).not.toContain('Save');
    expect(container.textContent).not.toContain('Add WPs');

    const drawButton = container.querySelector<HTMLButtonElement>('[aria-label="Draw survey area on map"]');

    if (drawButton === null) {
      throw new Error('Draw survey area button was not rendered.');
    }

    await act(async () => {
      drawButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSetAdvancedTool).toHaveBeenCalledWith('drawSurveyPolygon');
  });

  it('opens a Survey form from manual coordinates with current defaults', async () => {
    const onAddSurvey = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={selectedWaypointPlan()}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={onAddSurvey}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Survey');

    const manualButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Manual coordinates',
    );

    if (!(manualButton instanceof HTMLButtonElement)) {
      throw new Error('Survey manual coordinates button was not rendered.');
    }

    await act(async () => {
      manualButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textArea = container.querySelector('textarea.mp-textarea');
    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Save',
    );

    expect(textArea).toBeInstanceOf(HTMLTextAreaElement);
    expect(saveButton).toBeUndefined();
    expect(container.textContent).toContain('Add WPs');
    expect(container.textContent).not.toContain('New');
    expect(onAddSurvey).toHaveBeenCalledWith(
      'mission-1',
      expect.objectContaining({
        name: 'Survey 1',
      }),
    );
  });

  it('opens a Survey form from a map draft after Create survey', async () => {
    const setMapPolygonDraft = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={selectedWaypointPlan()}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="drawSurveyPolygon"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={{
            purpose: 'survey',
            id: 'survey-draft-1',
            vertices: [
              { lat: 40.416, lng: -3.704 },
              { lat: 40.417, lng: -3.703 },
              { lat: 40.418, lng: -3.705 },
            ],
          }}
          setMapPolygonDraft={setMapPolygonDraft}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Survey');

    expect(container.textContent).toContain('3 vertices - ready to create');

    const createButton = container.querySelector<HTMLButtonElement>('[aria-label="Create survey from draft"]');

    if (createButton === null) {
      throw new Error('Create survey button was not rendered.');
    }

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Save',
    );

    expect(setMapPolygonDraft).toHaveBeenCalledWith(null);
    expect(saveButton).toBeUndefined();
    expect(container.textContent).toContain('Add WPs');
    expect(container.textContent).toContain('40.416, -3.704');
  });

  it('adds a Survey created from a map draft and updates it while editing', async () => {
    const onAddSurvey = vi.fn();
    const onUpdateSurvey = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={selectedWaypointPlan()}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="drawSurveyPolygon"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={onAddSurvey}
          onUpdateSurvey={onUpdateSurvey}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={{
            purpose: 'survey',
            id: 'survey-draft-1',
            vertices: [
              { lat: 40.416, lng: -3.704 },
              { lat: 40.417, lng: -3.703 },
              { lat: 40.418, lng: -3.705 },
            ],
          }}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Survey');

    const createButton = container.querySelector<HTMLButtonElement>('[aria-label="Create survey from draft"]');

    if (createButton === null) {
      throw new Error('Create survey button was not rendered.');
    }

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddSurvey).toHaveBeenCalledTimes(1);
    expect(onAddSurvey).toHaveBeenCalledWith(
      'mission-1',
      expect.objectContaining({
        name: 'Survey 1',
        polygon: [
          { lat: 40.416, lng: -3.704 },
          { lat: 40.417, lng: -3.703 },
          { lat: 40.418, lng: -3.705 },
        ],
      }),
    );
    expect(onUpdateSurvey).not.toHaveBeenCalled();

    const addSurveyCall = onAddSurvey.mock.calls[0];
    if (addSurveyCall === undefined) {
      throw new Error('Expected Create survey to add a Survey before editing.');
    }
    const createdSurvey = addSurveyCall[1] as SurveyGridSpec;

    const surveyInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input.mp-input'));
    const nameInput = surveyInputs[0];
    const altitudeInput = surveyInputs.find((candidate) => candidate.type === 'number' && candidate.value === '60');
    const spacingInput = surveyInputs.find((candidate) => candidate.type === 'number' && candidate.value === '35');
    const polygonInput = container.querySelector<HTMLTextAreaElement>('textarea.mp-textarea');

    if (
      !(nameInput instanceof HTMLInputElement) ||
      !(altitudeInput instanceof HTMLInputElement) ||
      !(spacingInput instanceof HTMLInputElement) ||
      !(polygonInput instanceof HTMLTextAreaElement)
    ) {
      throw new Error('Expected Survey form fields to render before editing.');
    }

    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Save',
    );
    expect(saveButton).toBeUndefined();

    await changeFormValue(nameInput, 'Edited survey area');
    await changeFormValue(
      polygonInput,
      ['40.42, -3.71', '40.421, -3.711', '40.422, -3.712'].join('\n'),
    );
    await changeFormValue(altitudeInput, '75');
    await changeFormValue(spacingInput, '22');

    expect(onAddSurvey).toHaveBeenCalledTimes(1);
    expect(onUpdateSurvey).toHaveBeenLastCalledWith(
      'mission-1',
      createdSurvey.id,
      expect.objectContaining({
        name: 'Edited survey area',
        polygon: [
          { lat: 40.42, lng: -3.71 },
          { lat: 40.421, lng: -3.711 },
          { lat: 40.422, lng: -3.712 },
        ],
        altitudeM: 75,
        laneSpacingM: 22,
      }),
    );
  });

  it('updates a saved Survey when editing its form instead of creating another draft', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<StatefulSurveyPanel />);
    });

    await clickPanelTab(container, 'Survey');

    const createButton = container.querySelector<HTMLButtonElement>('[aria-label="Create survey from draft"]');
    if (!(createButton instanceof HTMLButtonElement)) {
      throw new Error('Create survey button was not rendered.');
    }

    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const nameInput = container.querySelector<HTMLInputElement>('input.mp-input');
    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error('Survey name input was not rendered after creating.');
    }

    await changeFormValue(nameInput, 'Updated saved survey');

    const surveyRows = Array.from(container.querySelectorAll<HTMLButtonElement>('.mp-layer-row'));
    expect(surveyRows).toHaveLength(1);
    expect(surveyRows[0]?.textContent).toContain('Updated saved survey');
  });

  it('clears an active Survey draft when selecting a saved Survey', async () => {
    const onSetAdvancedTool = vi.fn();
    const setMapPolygonDraft = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={selectedWaypointPlan()}
          advanced={{
            fences: [],
            rallyPoints: [],
            surveys: [
              {
                id: 'survey-existing-1',
                name: 'Existing survey',
                polygon: [
                  { lat: 40.416, lng: -3.704 },
                  { lat: 40.417, lng: -3.703 },
                  { lat: 40.418, lng: -3.705 },
                ],
                altitudeM: 60,
                angleDeg: 0,
                laneSpacingM: 35,
                overshootM: 5,
                pattern: 'grid',
                startCorner: 'southWest',
                cameraTriggerMode: 'distance',
                cameraTriggerDistanceM: 25,
              },
            ],
          }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="drawSurveyPolygon"
          onSetAdvancedTool={onSetAdvancedTool}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={{
            purpose: 'survey',
            id: 'survey-draft-1',
            vertices: [
              { lat: 40.416, lng: -3.704 },
              { lat: 40.417, lng: -3.703 },
              { lat: 40.418, lng: -3.705 },
            ],
          }}
          setMapPolygonDraft={setMapPolygonDraft}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Survey');

    const surveyRow = Array.from(container.querySelectorAll<HTMLButtonElement>('.mp-layer-row')).find(
      (candidate) => candidate.textContent?.includes('Existing survey') === true,
    );
    if (!(surveyRow instanceof HTMLButtonElement)) {
      throw new Error('Expected existing Survey row to render.');
    }

    await act(async () => {
      surveyRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setMapPolygonDraft).toHaveBeenCalledWith(null);
    expect(onSetAdvancedTool).toHaveBeenCalledWith('select');
  });

  it('keeps Survey and Fence map drafts separate in their tabs', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={selectedWaypointPlan()}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="drawSurveyPolygon"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={{
            purpose: 'survey',
            id: 'survey-draft-1',
            vertices: [
              { lat: 40.416, lng: -3.704 },
              { lat: 40.417, lng: -3.703 },
              { lat: 40.418, lng: -3.705 },
            ],
          }}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    expect(container.textContent).toContain('Place Fence');
    expect(container.textContent).not.toContain('3 vertices - ready to create');

    await clickPanelTab(container, 'Survey');

    expect(container.textContent).toContain('3 vertices - ready to create');
  });

  it('does not render a fence form before a saved fence is selected or created', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    expect(container.querySelectorAll('input.mp-input')).toHaveLength(0);
    expect(container.querySelector('textarea.mp-textarea')).toBeNull();
    expect(container.textContent).not.toContain('Save');
    expect(container.textContent).toContain('No fences created yet.');
  });

  it('keeps a polygon fence position when changing it to a circle', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={advancedPlan()}
          defaultCoordinate={{ lat: 41, lng: -4, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    const savedFenceButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes('Site Fence') === true,
    );

    if (!(savedFenceButton instanceof HTMLButtonElement)) {
      throw new Error('Saved fence row was not rendered.');
    }

    await act(async () => {
      savedFenceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const shapeSelect = Array.from(container.querySelectorAll<HTMLSelectElement>('select.mp-input')).find(
      (candidate) => candidate.value === 'polygon',
    );

    if (!(shapeSelect instanceof HTMLSelectElement)) {
      throw new Error('Fence shape selector was not rendered.');
    }

    await act(async () => {
      shapeSelect.value = 'circle';
      shapeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const numberInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    const latitudeInput = numberInputs.find((candidate) => candidate.value === '40.4166667');
    const longitudeInput = numberInputs.find((candidate) => candidate.value === '-3.7026667');

    expect(latitudeInput).toBeInstanceOf(HTMLInputElement);
    expect(longitudeInput).toBeInstanceOf(HTMLInputElement);
    expect(numberInputs.some((candidate) => candidate.value === '41')).toBe(false);
    expect(numberInputs.some((candidate) => candidate.value === '-4')).toBe(false);
  });

  it('does not render a New button in the fence editor', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={advancedPlan()}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    const savedFenceButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes('Site Fence') === true,
    );

    if (!(savedFenceButton instanceof HTMLButtonElement)) {
      throw new Error('Saved fence row was not rendered.');
    }

    await act(async () => {
      savedFenceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const buttonLabels = Array.from(container.querySelectorAll('button')).map(
      (candidate) => candidate.textContent?.trim() ?? '',
    );

    expect(buttonLabels).toContain('Save');
    expect(buttonLabels).not.toContain('New');
  });

  it('shows a map draft counter and Create button when 3 map vertices are drafted', async () => {
    const onAddFence = vi.fn();
    const setMapPolygonDraft = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="drawFencePolygon"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={onAddFence}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={{
            purpose: 'fence',
            id: 'draft-map-1',
            vertices: [
              { lat: 40.416, lng: -3.704 },
              { lat: 40.417, lng: -3.703 },
              { lat: 40.418, lng: -3.705 },
            ],
          }}
          setMapPolygonDraft={setMapPolygonDraft}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    expect(container.textContent).toContain('3 vertices - ready to create');

    const button = container.querySelector<HTMLButtonElement>('[aria-label="Create fence from draft"]');

    if (button === null) {
      throw new Error('Create fence button was not rendered.');
    }

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddFence).toHaveBeenCalledWith(
      'mission-1',
      expect.objectContaining({ name: 'Fence 1' }),
    );
    expect(setMapPolygonDraft).toHaveBeenCalledWith(null);
  });

  it('clears drafts when leaving the Fence tab', async () => {
    const setMapPolygonDraft = vi.fn();
    const onClearSourceMissionItems = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={['wp-1', 'wp-2', 'wp-3']}
          activeAdvancedTool="selectFenceSource"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={onClearSourceMissionItems}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={{
            purpose: 'fence',
            id: 'draft-map-1',
            vertices: [
              { lat: 40.416, lng: -3.704 },
              { lat: 40.417, lng: -3.703 },
              { lat: 40.418, lng: -3.705 },
            ],
          }}
          setMapPolygonDraft={setMapPolygonDraft}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Fence');

    await clickPanelTab(container, 'Rally');

    expect(setMapPolygonDraft).toHaveBeenCalledWith(null);
    expect(onClearSourceMissionItems).toHaveBeenCalled();
  });

  it('opens the Rally tab without an edit form or New button', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Rally');

    expect(container.textContent).toContain('Place on map');
    expect(container.textContent).toContain('Current position');
    expect(container.textContent).toContain('Manual coordinates');
    expect(container.textContent).toContain('No rally points created yet.');
    expect(container.querySelectorAll('input.mp-input')).toHaveLength(0);
    expect(container.textContent).not.toContain('Save');
    expect(Array.from(container.querySelectorAll('button')).map((button) => button.textContent?.trim() ?? '')).not.toContain('New');
  });

  it('opens an unsaved Rally form from Manual coordinates', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={vi.fn()}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Rally');

    const manualButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Manual coordinates',
    );

    if (!(manualButton instanceof HTMLButtonElement)) {
      throw new Error('Rally manual coordinates button was not rendered.');
    }

    await act(async () => {
      manualButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Save');
    expect(container.textContent).toContain('Name');
    expect(container.querySelectorAll('input.mp-input').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('New');
  });

  it('opens an editable Rally form from Current position without saving immediately', async () => {
    const onAddRallyPoint = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AdvancedMissionPanel
          missionId="mission-1"
          plan={null}
          advanced={{ fences: [], rallyPoints: [], surveys: [] }}
          defaultCoordinate={{ lat: 40.4168, lng: -3.7038, alt: 80 }}
          locked={false}
          selectedSourceMissionItemIds={[]}
          activeAdvancedTool="select"
          onSetAdvancedTool={vi.fn()}
          onClearSourceMissionItems={vi.fn()}
          onAddFence={vi.fn()}
          onUpdateFence={vi.fn()}
          onRemoveFence={vi.fn()}
          onAddRallyPoint={onAddRallyPoint}
          onUpdateRallyPoint={vi.fn()}
          onRemoveRallyPoint={vi.fn()}
          onAddSurvey={vi.fn()}
          onUpdateSurvey={vi.fn()}
          onRemoveSurvey={vi.fn()}
          onAppendMissionItems={vi.fn()}
          onExportMissionJson={vi.fn()}
          onImportMissionJson={vi.fn()}
          onMinimize={vi.fn()}
          mapPolygonDraft={null}
          setMapPolygonDraft={vi.fn()}
          pinned={false}
          panelStyle={undefined}
          onTogglePin={vi.fn()}
          onPanelDragStart={vi.fn()}
        />,
      );
    });

    await clickPanelTab(container, 'Rally');

    const currentPositionButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Current position',
    );

    if (!(currentPositionButton instanceof HTMLButtonElement)) {
      throw new Error('Rally current position button was not rendered.');
    }

    await act(async () => {
      currentPositionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddRallyPoint).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Save');
    const nameInput = container.querySelector<HTMLInputElement>('input.mp-input');
    expect(nameInput?.value).toBe('Rally from current position');
  });
});
