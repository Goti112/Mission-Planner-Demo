import { ChevronRight, Grid3X3 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  createMissionItem,
  calculateDomainMissionMetrics,
  getMissionCommandDefinition,
  getMissionVehicleProfile,
  selectMissionTableRows,
  validateMissionPlan,
  type DomainMissionMetrics,
  type MissionCommand,
  type MissionCoordinate,
  type MissionItem,
  type MissionVehicleType,
} from '../domain';
import AdvancedMissionPanel from './AdvancedMissionPanel';
import MissionCommandTable from './MissionCommandTable';
import MissionCommandToolbox from './MissionCommandToolbox';
import MissionPlanToolbar from './MissionPlanToolbar';
import MissionReadinessPanel from './MissionReadinessPanel';
import {
  evaluateMissionPlanExecution,
  type MissionExecutionReadiness,
} from './missionPlanAdapter';
import { createDefaultMissionItem } from './missionPlanItemFactory';
import { useMissionPlanStore } from './missionPlanStore';
import { useAdvancedLayerUiStore } from './advancedLayerUiStore';
import type { PlannerMissionRecord } from './types';
import './MissionPlanningWorkbench.css';

export interface MissionPlanningWorkbenchProps {
  readonly selectedDroneId: string | null;
  readonly droneOptions: readonly { readonly id: string; readonly name: string }[];
  readonly defaultCoordinate: MissionCoordinate;
  readonly map: ReactNode;
  readonly onStartExecution: (missionId: string) => void;
  readonly onExportMissionJson: (missionId: string) => string;
  readonly onImportMissionJson: (missionId: string, rawText: string) => void;
  readonly onSelectedItemChange: (itemId: string | null) => void;
}

const VEHICLE_TYPE: MissionVehicleType = 'copter';

interface PanelPosition {
  readonly x: number;
  readonly y: number;
}

interface PanelDragState {
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startX: number;
  readonly startY: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
}

interface BottomBandResizeState {
  readonly startClientY: number;
  readonly startHeight: number;
  readonly minHeight: number;
  readonly maxHeight: number;
}

interface BottomSplitResizeState {
  readonly startClientX: number;
  readonly startReadinessWidth: number;
  readonly minReadinessWidth: number;
  readonly maxReadinessWidth: number;
}

const DEFAULT_ADVANCED_PANEL_POSITION: PanelPosition = { x: 174, y: 12 };
const PANEL_EDGE_GAP = 12;
const DEFAULT_BOTTOM_BAND_HEIGHT = 192;
const MIN_BOTTOM_BAND_HEIGHT = 128;
const MIN_STAGE_HEIGHT = 300;
const DEFAULT_READINESS_PANEL_WIDTH = 320;
const MIN_READINESS_PANEL_WIDTH = 220;
const MIN_TABLE_PANEL_WIDTH = 280;
const BOTTOM_SPLIT_HANDLE_WIDTH = 10;

const clampNumber = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const selectedMissionFromState = (
  missions: Record<string, PlannerMissionRecord>,
  selectedMissionId: string | null,
): PlannerMissionRecord | null => {
  if (selectedMissionId === null) {
    return null;
  }

  return missions[selectedMissionId] ?? null;
};

const findMissionForDrone = (
  missions: Record<string, PlannerMissionRecord>,
  droneId: string,
): PlannerMissionRecord | null => {
  const mission = Object.values(missions).find((record) => record.droneId === droneId);

  return mission ?? null;
};

const commandInsertSeq = (mission: PlannerMissionRecord, selectedItemId: string | null): number => {
  if (selectedItemId === null) {
    return mission.plan.items.length;
  }

  const selectedIndex = mission.plan.items.findIndex((item) => item.id === selectedItemId);

  return selectedIndex === -1 ? mission.plan.items.length : selectedIndex + 1;
};

export default function MissionPlanningWorkbench({
  selectedDroneId,
  droneOptions,
  defaultCoordinate,
  map,
  onStartExecution,
  onExportMissionJson,
  onImportMissionJson,
  onSelectedItemChange,
}: MissionPlanningWorkbenchProps) {
  const missions = useMissionPlanStore((state) => state.missions);
  const storeSelectedDroneId = useMissionPlanStore((state) => state.selectedDroneId);
  const selectedMissionId = useMissionPlanStore((state) => state.selectedMissionId);
  const selectedItemId = useMissionPlanStore((state) => state.selectedItemId);
  const createMission = useMissionPlanStore((state) => state.createMission);
  const selectDrone = useMissionPlanStore((state) => state.selectDrone);
  const selectItem = useMissionPlanStore((state) => state.selectItem);
  const addItem = useMissionPlanStore((state) => state.addItem);
  const updateItem = useMissionPlanStore((state) => state.updateItem);
  const removeItem = useMissionPlanStore((state) => state.removeItem);
  const reorderItem = useMissionPlanStore((state) => state.reorderItem);
  const renameMission = useMissionPlanStore((state) => state.renameMission);
  const addFence = useMissionPlanStore((state) => state.addFence);
  const updateFence = useMissionPlanStore((state) => state.updateFence);
  const removeFence = useMissionPlanStore((state) => state.removeFence);
  const addRallyPoint = useMissionPlanStore((state) => state.addRallyPoint);
  const updateRallyPoint = useMissionPlanStore((state) => state.updateRallyPoint);
  const removeRallyPoint = useMissionPlanStore((state) => state.removeRallyPoint);
  const addSurvey = useMissionPlanStore((state) => state.addSurvey);
  const updateSurvey = useMissionPlanStore((state) => state.updateSurvey);
  const removeSurvey = useMissionPlanStore((state) => state.removeSurvey);
  const activeAdvancedTool = useAdvancedLayerUiStore((state) => state.activeAdvancedTool);
  const selectedSourceMissionItemIds = useAdvancedLayerUiStore((state) => state.selectedSourceMissionItemIds);
  const mapPolygonDraft = useAdvancedLayerUiStore((state) => state.mapPolygonDraft);
  const setMapPolygonDraft = useAdvancedLayerUiStore((state) => state.setMapPolygonDraft);
  const setActiveAdvancedTool = useAdvancedLayerUiStore((state) => state.setActiveAdvancedTool);
  const toggleSourceMissionItem = useAdvancedLayerUiStore((state) => state.toggleSourceMissionItem);
  const clearSourceMissionItems = useAdvancedLayerUiStore((state) => state.clearSourceMissionItems);
  const [advancedPanelMinimized, setAdvancedPanelMinimized] = useState(false);
  const [advancedPanelPosition, setAdvancedPanelPosition] = useState<PanelPosition | null>(null);
  const [bottomBandHeight, setBottomBandHeight] = useState(DEFAULT_BOTTOM_BAND_HEIGHT);
  const [readinessPanelWidth, setReadinessPanelWidth] = useState(DEFAULT_READINESS_PANEL_WIDTH);
  const [bottomBandResizing, setBottomBandResizing] = useState(false);
  const [bottomSplitResizing, setBottomSplitResizing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const bottomBandRef = useRef<HTMLDivElement>(null);
  const panelDragRef = useRef<PanelDragState | null>(null);
  const bottomBandResizeRef = useRef<BottomBandResizeState | null>(null);
  const bottomSplitResizeRef = useRef<BottomSplitResizeState | null>(null);

  const clampPanelPosition = useCallback((position: PanelPosition, drag: PanelDragState): PanelPosition => {
    const maxX = Math.max(PANEL_EDGE_GAP, drag.stageWidth - drag.panelWidth - PANEL_EDGE_GAP);
    const maxY = Math.max(PANEL_EDGE_GAP, drag.stageHeight - drag.panelHeight - PANEL_EDGE_GAP);

    return {
      x: Math.min(Math.max(PANEL_EDGE_GAP, position.x), maxX),
      y: Math.min(Math.max(PANEL_EDGE_GAP, position.y), maxY),
    };
  }, []);

  const toggleAdvancedPanelPin = useCallback((): void => {
    setAdvancedPanelPosition((position) => (position === null ? DEFAULT_ADVANCED_PANEL_POSITION : null));
  }, []);

  const startPanelDrag = useCallback((
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLElement && target.closest('button, input, select, textarea, label')) {
      return;
    }

    const stage = stageRef.current;
    const panelElement = event.currentTarget.closest('.mp-advanced, .mp-inspector');

    if (stage === null || !(panelElement instanceof HTMLElement)) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const panelRect = panelElement.getBoundingClientRect();

    panelDragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: panelRect.left - stageRect.left,
      startY: panelRect.top - stageRect.top,
      panelWidth: panelRect.width,
      panelHeight: panelRect.height,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
    };

    event.preventDefault();
  }, []);

  const startBottomBandResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) {
      return;
    }

    const bottomBand = bottomBandRef.current;
    const stage = stageRef.current;

    if (bottomBand === null || stage === null) {
      return;
    }

    const startHeight = bottomBand.getBoundingClientRect().height;
    const expandableStageHeight = Math.max(0, stage.getBoundingClientRect().height - MIN_STAGE_HEIGHT);

    bottomBandResizeRef.current = {
      startClientY: event.clientY,
      startHeight,
      minHeight: MIN_BOTTOM_BAND_HEIGHT,
      maxHeight: Math.max(MIN_BOTTOM_BAND_HEIGHT, startHeight + expandableStageHeight),
    };
    setBottomBandResizing(true);
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }, []);

  const startBottomSplitResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) {
      return;
    }

    const bottomBand = bottomBandRef.current;

    if (bottomBand === null) {
      return;
    }

    const bottomBandWidth = bottomBand.getBoundingClientRect().width;
    const maxReadinessWidth = Math.max(
      MIN_READINESS_PANEL_WIDTH,
      bottomBandWidth - MIN_TABLE_PANEL_WIDTH - BOTTOM_SPLIT_HANDLE_WIDTH,
    );

    bottomSplitResizeRef.current = {
      startClientX: event.clientX,
      startReadinessWidth: readinessPanelWidth,
      minReadinessWidth: MIN_READINESS_PANEL_WIDTH,
      maxReadinessWidth,
    };
    setBottomSplitResizing(true);
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }, [readinessPanelWidth]);

  const advancedPanelStyle = useMemo<CSSProperties | undefined>(
    () =>
      advancedPanelPosition === null
        ? undefined
        : {
            left: advancedPanelPosition.x,
            top: advancedPanelPosition.y,
            maxHeight: `calc(100% - ${advancedPanelPosition.y + PANEL_EDGE_GAP}px)`,
          },
    [advancedPanelPosition],
  );

  const bottomBandStyle = useMemo<CSSProperties>(
    () => ({
      height: bottomBandHeight,
      gridTemplateColumns: `minmax(${MIN_TABLE_PANEL_WIDTH}px, 1fr) ${BOTTOM_SPLIT_HANDLE_WIDTH}px ${readinessPanelWidth}px`,
    }),
    [bottomBandHeight, readinessPanelWidth],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const drag = panelDragRef.current;

      if (drag === null) {
        return;
      }

      const nextPosition = clampPanelPosition(
        {
          x: drag.startX + event.clientX - drag.startClientX,
          y: drag.startY + event.clientY - drag.startClientY,
        },
        drag,
      );

      setAdvancedPanelPosition(nextPosition);
    };

    const handlePointerUp = (): void => {
      panelDragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [clampPanelPosition]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const resize = bottomBandResizeRef.current;

      if (resize === null) {
        return;
      }

      const nextHeight = resize.startHeight + resize.startClientY - event.clientY;
      setBottomBandHeight(clampNumber(nextHeight, resize.minHeight, resize.maxHeight));
      event.preventDefault();
    };

    const handlePointerUp = (): void => {
      bottomBandResizeRef.current = null;
      setBottomBandResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const resize = bottomSplitResizeRef.current;

      if (resize === null) {
        return;
      }

      const nextReadinessWidth = resize.startReadinessWidth + resize.startClientX - event.clientX;
      setReadinessPanelWidth(clampNumber(nextReadinessWidth, resize.minReadinessWidth, resize.maxReadinessWidth));
      event.preventDefault();
    };

    const handlePointerUp = (): void => {
      bottomSplitResizeRef.current = null;
      setBottomSplitResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  const handleSelectDrone = useCallback(
    (droneId: string | null): void => {
      selectDrone(droneId);
      onSelectedItemChange(useMissionPlanStore.getState().selectedItemId);
    },
    [onSelectedItemChange, selectDrone],
  );

  useEffect(() => {
    handleSelectDrone(selectedDroneId);

    if (selectedDroneId === null) {
      return;
    }

    const state = useMissionPlanStore.getState();
    const selectedMission = selectedMissionFromState(state.missions, state.selectedMissionId);
    const droneMission = findMissionForDrone(state.missions, selectedDroneId);

    if (selectedMission === null && droneMission === null) {
      createMission({
        name: 'Mission 1',
        droneId: selectedDroneId,
        vehicleType: VEHICLE_TYPE,
        home: defaultCoordinate,
      });
    }
  }, [createMission, defaultCoordinate, handleSelectDrone, selectedDroneId]);

  const selectedMission = useMemo(
    () => selectedMissionFromState(missions, selectedMissionId),
    [missions, selectedMissionId],
  );
  const plan = selectedMission?.plan ?? null;
  const profile = getMissionVehicleProfile(plan?.vehicleType ?? VEHICLE_TYPE);
  const metrics = useMemo<DomainMissionMetrics | null>(
    () => (plan === null ? null : calculateDomainMissionMetrics(plan, profile.defaultCruiseSpeedMps)),
    [plan, profile.defaultCruiseSpeedMps],
  );
  const validation = useMemo(
    () => (plan === null ? null : validateMissionPlan(plan)),
    [plan],
  );
  const rows = useMemo(() => (plan === null ? [] : selectMissionTableRows(plan)), [plan]);
  const navCommands = useMemo(
    () => profile.allowedCommands.filter((command) => getMissionCommandDefinition(command).category === 'nav'),
    [profile.allowedCommands],
  );
  const readiness = useMemo<MissionExecutionReadiness | null>(
    () => (plan === null ? null : evaluateMissionPlanExecution({ plan })),
    [plan],
  );
  const locked = selectedMission?.status === 'running';

  const handleCreateMission = useCallback((): void => {
    const droneId = storeSelectedDroneId;

    if (droneId === null) {
      throw new Error('Cannot create mission because no drone is selected.');
    }

    const missionCount = Object.values(useMissionPlanStore.getState().missions).filter(
      (mission) => mission.droneId === droneId,
    ).length;

    createMission({
      name: `Mission ${missionCount + 1}`,
      droneId,
      vehicleType: VEHICLE_TYPE,
      home: defaultCoordinate,
    });
    onSelectedItemChange(null);
  }, [createMission, defaultCoordinate, onSelectedItemChange, storeSelectedDroneId]);

  const ensureMissionForSelectedDrone = useCallback((): PlannerMissionRecord => {
    const state = useMissionPlanStore.getState();
    const droneId = state.selectedDroneId;

    if (droneId === null) {
      throw new Error('Cannot add mission command because no drone is selected.');
    }

    const selectedMission = selectedMissionFromState(state.missions, state.selectedMissionId);
    const mission = selectedMission ?? findMissionForDrone(state.missions, droneId);

    if (mission !== null) {
      return mission;
    }

    const missionId = state.createMission({
      name: 'Mission 1',
      droneId,
      vehicleType: VEHICLE_TYPE,
      home: defaultCoordinate,
    });
    const createdMission = useMissionPlanStore.getState().missions[missionId];

    if (createdMission === undefined) {
      throw new Error(`Mission ${missionId} was not found after creation for drone ${droneId}.`);
    }

    return createdMission;
  }, [defaultCoordinate]);

  const handleAddCommand = useCallback(
    (command: MissionCommand): void => {
      if (locked) {
        return;
      }

      const mission = ensureMissionForSelectedDrone();
      const state = useMissionPlanStore.getState();
      const afterItemId = state.selectedItemId;
      const seq = commandInsertSeq(mission, afterItemId);
      const item = createDefaultMissionItem(command, seq, defaultCoordinate);

      addItem(mission.id, item, afterItemId);
      onSelectedItemChange(item.id);
    },
    [addItem, defaultCoordinate, ensureMissionForSelectedDrone, locked, onSelectedItemChange],
  );

  const handleSelectItem = useCallback(
    (itemId: string): void => {
      selectItem(itemId);
      onSelectedItemChange(itemId);
    },
    [onSelectedItemChange, selectItem],
  );

  const handleRemoveItem = useCallback(
    (itemId: string): void => {
      if (selectedMission === null) {
        throw new Error(`Cannot remove mission item ${itemId} because no mission is selected.`);
      }

      removeItem(selectedMission.id, itemId);
      onSelectedItemChange(useMissionPlanStore.getState().selectedItemId);
    },
    [onSelectedItemChange, removeItem, selectedMission],
  );

  const handleReorderItem = useCallback(
    (fromIndex: number, toIndex: number): void => {
      if (selectedMission === null) {
        throw new Error(
          `Cannot reorder mission item because no mission is selected; fromIndex=${fromIndex}, toIndex=${toIndex}.`,
        );
      }

      reorderItem(selectedMission.id, fromIndex, toIndex);
    },
    [reorderItem, selectedMission],
  );

  const handleUpdateItem = useCallback(
    (itemId: string, patch: Partial<Omit<MissionItem, 'id' | 'seq'>>): void => {
      if (selectedMission === null) {
        throw new Error(`Cannot update mission item ${itemId} because no mission is selected.`);
      }

      updateItem(selectedMission.id, itemId, patch);
    },
    [selectedMission, updateItem],
  );

  const handleChangeItemCommand = useCallback(
    (itemId: string, command: MissionCommand): void => {
      if (locked) {
        return;
      }

      if (selectedMission === null) {
        throw new Error(`Cannot change mission item ${itemId} to command ${command} because no mission is selected.`);
      }

      if (getMissionCommandDefinition(command).category !== 'nav') {
        throw new Error(`Cannot change mission item ${itemId} to non-nav command ${command} from the command table.`);
      }

      const currentItem = selectedMission.plan.items.find((item) => item.id === itemId);

      if (currentItem === undefined) {
        throw new Error(`Cannot change mission item ${itemId} to command ${command} because the item was not found.`);
      }

      const replacement = createDefaultMissionItem(
        command,
        currentItem.seq,
        currentItem.coordinate ?? defaultCoordinate,
      );

      updateItem(selectedMission.id, itemId, {
        command: replacement.command,
        frame: replacement.frame,
        params: replacement.params,
        coordinate: replacement.coordinate,
      });
    },
    [defaultCoordinate, locked, selectedMission, updateItem],
  );

  const handleAppendMissionItems = useCallback(
    (missionId: string, items: readonly MissionItem[]): void => {
      const state = useMissionPlanStore.getState();
      const mission = state.missions[missionId];

      if (mission === undefined) {
        throw new Error(`Cannot append generated mission items because mission ${missionId} was not found.`);
      }

      const batchId = Date.now().toString(36);
      let afterItemId = state.selectedMissionId === missionId ? state.selectedItemId : null;

      items.forEach((item, index) => {
        const nextItem = createMissionItem({
          id: `${item.id}-${batchId}-${index.toString()}`,
          seq: mission.plan.items.length + index,
          command: item.command,
          frame: item.frame,
          current: item.current,
          autocontinue: item.autocontinue,
          params: item.params,
          coordinate: item.coordinate,
        });

        addItem(missionId, nextItem, afterItemId);
        afterItemId = nextItem.id;
      });

      onSelectedItemChange(afterItemId);
    },
    [addItem, onSelectedItemChange],
  );

  const handleRenameMission = useCallback(
    (name: string): void => {
      if (selectedMission === null) {
        throw new Error(`Cannot rename mission to "${name}" because no mission is selected.`);
      }

      renameMission(selectedMission.id, name);
    },
    [renameMission, selectedMission],
  );

  const handleUploadStart = useCallback((): void => {
    if (selectedMission === null) {
      throw new Error('Cannot start mission because no mission is selected.');
    }

    if (readiness === null) {
      throw new Error(`Cannot start mission ${selectedMission.id} because readiness has not been evaluated.`);
    }

    if (!readiness.canExecute) {
      throw new Error(
        `Cannot start mission ${selectedMission.id} because readiness is blocked: ${readiness.blockers
          .map((issue) => issue.message)
          .join('; ')}`,
      );
    }

    onStartExecution(selectedMission.id);
  }, [onStartExecution, readiness, selectedMission]);

  const handleExportMissionJson = useCallback((missionId: string): string => {
    const mission = useMissionPlanStore.getState().missions[missionId];

    if (mission === undefined) {
      throw new Error(`Cannot export mission JSON because mission ${missionId} was not found.`);
    }

    return onExportMissionJson(mission.id);
  }, [onExportMissionJson]);

  const handleImportMissionJson = useCallback((missionId: string, rawText: string): void => {
    const mission = useMissionPlanStore.getState().missions[missionId];

    if (mission === undefined) {
      throw new Error(`Cannot import mission JSON because mission ${missionId} was not found.`);
    }

    onImportMissionJson(mission.id, rawText);
  }, [onImportMissionJson]);

  return (
    <div
      className={
        bottomBandResizing
          ? 'mp-workbench mp-workbench--resizing-bottom'
          : bottomSplitResizing
            ? 'mp-workbench mp-workbench--resizing-split'
            : 'mp-workbench'
      }
    >
      <MissionPlanToolbar
        mission={selectedMission}
        droneOptions={droneOptions}
        selectedDroneId={storeSelectedDroneId}
        metrics={metrics}
        validation={validation}
        readiness={readiness}
        onSelectDrone={handleSelectDrone}
        onCreateMission={handleCreateMission}
        onRenameMission={handleRenameMission}
        onUploadStart={handleUploadStart}
      />

      <div ref={stageRef} className="mp-stage">
        <div className="mp-stage__map">{map}</div>
        <MissionCommandToolbox
          vehicleType={plan?.vehicleType ?? VEHICLE_TYPE}
          disabled={locked || storeSelectedDroneId === null}
          onAddCommand={handleAddCommand}
        />
        {advancedPanelMinimized ? (
          <button
            type="button"
            className="mp-panel-reopen mp-panel-reopen--advanced"
            onClick={() => setAdvancedPanelMinimized(false)}
            title="Open advanced panel"
            aria-label="Open advanced panel"
          >
            <ChevronRight size={13} />
            <Grid3X3 size={13} />
            <span>Advanced</span>
          </button>
        ) : (
          <AdvancedMissionPanel
            missionId={selectedMission?.id ?? null}
            plan={plan}
            advanced={selectedMission?.advanced ?? null}
            defaultCoordinate={defaultCoordinate}
            locked={locked}
            selectedSourceMissionItemIds={selectedSourceMissionItemIds}
            activeAdvancedTool={activeAdvancedTool}
            onSetAdvancedTool={setActiveAdvancedTool}
            onClearSourceMissionItems={clearSourceMissionItems}
            mapPolygonDraft={mapPolygonDraft}
            setMapPolygonDraft={setMapPolygonDraft}
            onAddFence={addFence}
            onUpdateFence={updateFence}
            onRemoveFence={removeFence}
            onAddRallyPoint={addRallyPoint}
            onUpdateRallyPoint={updateRallyPoint}
            onRemoveRallyPoint={removeRallyPoint}
            onAddSurvey={addSurvey}
            onUpdateSurvey={updateSurvey}
            onRemoveSurvey={removeSurvey}
            onAppendMissionItems={handleAppendMissionItems}
            onExportMissionJson={handleExportMissionJson}
            onImportMissionJson={handleImportMissionJson}
            onMinimize={() => setAdvancedPanelMinimized(true)}
            pinned={advancedPanelPosition !== null}
            panelStyle={advancedPanelStyle}
            onTogglePin={toggleAdvancedPanelPin}
            onPanelDragStart={startPanelDrag}
          />
        )}
      </div>

      <div ref={bottomBandRef} className="mp-bottom-band" style={bottomBandStyle}>
        <button
          type="button"
          className="mp-bottom-band__resize"
          onPointerDown={startBottomBandResize}
          title="Resize command table"
          aria-label="Resize command table"
        />
        <MissionCommandTable
          rows={rows}
          navCommands={navCommands}
          selectedItemId={selectedItemId}
          defaultCoordinate={defaultCoordinate}
          locked={locked}
          sourceSelectionEnabled={
            activeAdvancedTool === 'selectFenceSource' || activeAdvancedTool === 'selectSurveySource'
          }
          selectedSourceItemIds={selectedSourceMissionItemIds}
          onSelectItem={handleSelectItem}
          onToggleSourceItem={toggleSourceMissionItem}
          onChangeItemCommand={handleChangeItemCommand}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
          onReorderItem={handleReorderItem}
        />
        <button
          type="button"
          className="mp-bottom-band__split-resize"
          onPointerDown={startBottomSplitResize}
          title="Resize command table and readiness panel"
          aria-label="Resize command table and readiness panel"
        />
        <MissionReadinessPanel readiness={readiness} validation={validation} />
      </div>
    </div>
  );
}
