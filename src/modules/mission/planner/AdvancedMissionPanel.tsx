import {
  ChevronLeft,
  Download,
  FileInput,
  Flag,
  Grid3X3,
  MapPinned,
  Pentagon,
  Pin,
  Save,
  Send,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CSSProperties, ChangeEvent, PointerEvent } from 'react';
import { CoordinateInput } from '../../../components/shared/CoordinateInput';
import type { MissionCoordinate, MissionItem, MissionPlan } from '../domain';
import { generateSurveyGrid } from './advancedMissionGeometry';
import {
  buildAdvancedMissionUploadItems,
  exportAdvancedPlanToQgcWpl,
} from './advancedMissionSerialization';
import type {
  AdvancedMissionPlan,
  FenceDefinition,
  FenceVertex,
  RallyPoint,
  SurveyGridSpec,
} from './advancedMissionTypes';
import { buildFenceDraftFromMissionItems, buildFenceDraftFromVertices, buildSurveyDraftFromMissionItems, buildSurveyDraftFromVertices } from './advancedLayerDrafts';
import type { AdvancedMapPolygonDraft } from './advancedMapPlacement';
import type { AdvancedLayerTool } from './advancedLayerUiStore';
import type { FenceFormState, RallyFormState, SurveyFormState } from './advancedMissionPanelModel';
import {
  createAdvancedId,
  readNumber,
  changeFenceFormField,
  missionPolygon,
  createRallyForm,
  createSurveyForm,
  fenceToForm,
  rallyToForm,
  surveyToForm,
  buildFence,
  buildRallyPoint,
  buildSurvey,
  formatArea,
  formatDistance,
  fenceSummary,
  fenceDraftSummary,
  rallySummary,
  uploadCommandName,
} from './advancedMissionPanelModel';

type AdvancedPanelTab = 'fence' | 'rally' | 'survey' | 'io';
export interface AdvancedMissionPanelProps {
  readonly missionId: string | null;
  readonly plan: MissionPlan | null;
  readonly advanced: AdvancedMissionPlan | null;
  readonly defaultCoordinate: MissionCoordinate;
  readonly locked: boolean;
  readonly selectedSourceMissionItemIds: readonly string[];
  readonly activeAdvancedTool: AdvancedLayerTool;
  readonly onSetAdvancedTool: (tool: AdvancedLayerTool) => void;
  readonly onClearSourceMissionItems: () => void;
  readonly onAddFence: (missionId: string, fence: FenceDefinition) => void;
  readonly onUpdateFence: (
    missionId: string,
    fenceId: string,
    patch: Partial<Omit<FenceDefinition, 'id' | 'shape'>>,
  ) => void;
  readonly onRemoveFence: (missionId: string, fenceId: string) => void;
  readonly onAddRallyPoint: (missionId: string, rallyPoint: RallyPoint) => void;
  readonly onUpdateRallyPoint: (
    missionId: string,
    rallyPointId: string,
    patch: Partial<Omit<RallyPoint, 'id'>>,
  ) => void;
  readonly onRemoveRallyPoint: (missionId: string, rallyPointId: string) => void;
  readonly onAddSurvey: (missionId: string, survey: SurveyGridSpec) => void;
  readonly onUpdateSurvey: (
    missionId: string,
    surveyId: string,
    patch: Partial<Omit<SurveyGridSpec, 'id'>>,
  ) => void;
  readonly onRemoveSurvey: (missionId: string, surveyId: string) => void;
  readonly onAppendMissionItems: (missionId: string, items: readonly MissionItem[]) => void;
  readonly onExportMissionJson: (missionId: string) => string;
  readonly onImportMissionJson: (missionId: string, rawText: string) => void;
  readonly onMinimize: () => void;
  readonly mapPolygonDraft: AdvancedMapPolygonDraft | null;
  readonly setMapPolygonDraft: (draft: AdvancedMapPolygonDraft | null) => void;
  readonly pinned: boolean;
  readonly panelStyle: CSSProperties | undefined;
  readonly onTogglePin: () => void;
  readonly onPanelDragStart: (event: PointerEvent<HTMLElement>) => void;
}

const emptyAdvancedPlan: AdvancedMissionPlan = {
  fences: [],
  rallyPoints: [],
  surveys: [],
};

export default function AdvancedMissionPanel({
  missionId,
  plan,
  advanced,
  defaultCoordinate,
  locked,
  selectedSourceMissionItemIds,
  activeAdvancedTool,
  onSetAdvancedTool,
  onClearSourceMissionItems,
  onAddFence,
  onUpdateFence,
  onRemoveFence,
  onAddRallyPoint,
  onUpdateRallyPoint,
  onRemoveRallyPoint,
  onAddSurvey,
  onUpdateSurvey,
  onRemoveSurvey,
  onAppendMissionItems,
  onExportMissionJson,
  onImportMissionJson,
  onMinimize,
  mapPolygonDraft,
  setMapPolygonDraft,
  pinned,
  panelStyle,
  onTogglePin,
  onPanelDragStart,
}: AdvancedMissionPanelProps) {
  const activeAdvanced = advanced ?? emptyAdvancedPlan;
  const seedPolygon = useMemo(() => missionPolygon(plan, defaultCoordinate), [defaultCoordinate, plan]);
  const [tab, setTab] = useState<AdvancedPanelTab | null>(null);
  const [ioText, setIoText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [fenceForm, setFenceForm] = useState<FenceFormState | null>(null);
  const [rallyForm, setRallyForm] = useState<RallyFormState | null>(null);
  const [surveyForm, setSurveyForm] = useState<SurveyFormState | null>(null);
  const advancedUploadItems = useMemo(
    () => buildAdvancedMissionUploadItems(activeAdvanced),
    [activeAdvanced],
  );
  const surveyPreview = useMemo(() => {
    if (surveyForm === null) {
      return null;
    }

    try {
      return generateSurveyGrid(buildSurvey(surveyForm));
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [surveyForm]);
  const selectedSourceMissionItems = useMemo(
    () => plan?.items.filter((item) => selectedSourceMissionItemIds.includes(item.id)) ?? [],
    [plan, selectedSourceMissionItemIds],
  );

  const fenceMapDraftVertices = useMemo<readonly FenceVertex[]>(
    () =>
      activeAdvancedTool === 'drawFencePolygon' &&
      mapPolygonDraft !== null &&
      mapPolygonDraft.purpose === 'fence'
        ? mapPolygonDraft.vertices
        : [],
    [activeAdvancedTool, mapPolygonDraft],
  );

  const surveyMapDraftVertices = useMemo<readonly FenceVertex[]>(
    () =>
      activeAdvancedTool === 'drawSurveyPolygon' &&
      mapPolygonDraft !== null &&
      mapPolygonDraft.purpose === 'survey'
        ? mapPolygonDraft.vertices
        : [],
    [activeAdvancedTool, mapPolygonDraft],
  );

  const fenceDraftSource = useMemo<'map' | 'waypoints' | null>(() => {
    if (fenceMapDraftVertices.length > 0) {
      return 'map';
    }

    if (activeAdvancedTool === 'selectFenceSource' && selectedSourceMissionItems.length > 0) {
      return 'waypoints';
    }

    return null;
  }, [activeAdvancedTool, fenceMapDraftVertices.length, selectedSourceMissionItems.length]);

  const surveyDraftSource = useMemo<'map' | 'waypoints' | null>(() => {
    if (surveyMapDraftVertices.length > 0) {
      return 'map';
    }

    if (activeAdvancedTool === 'selectSurveySource' && selectedSourceMissionItems.length > 0) {
      return 'waypoints';
    }

    return null;
  }, [activeAdvancedTool, selectedSourceMissionItems.length, surveyMapDraftVertices.length]);

  const fenceDraftCount = fenceDraftSource === 'map' ? fenceMapDraftVertices.length : selectedSourceMissionItems.length;
  const surveyDraftCount = surveyDraftSource === 'map' ? surveyMapDraftVertices.length : selectedSourceMissionItems.length;
  const canCreateFenceFromDraft = fenceDraftSource !== null && fenceDraftCount >= 3;
  const canCreateSurveyFromDraft = surveyDraftSource !== null && surveyDraftCount >= 3;

  const getToolButtonClass = (active: boolean): string =>
    active ? 'mp-button mp-button--toggle mp-button--active' : 'mp-button mp-button--toggle';

  const setErrorMessage = (error: unknown): void => {
    setMessage(error instanceof Error ? error.message : String(error));
  };

  const requireMissionId = (): string => {
    if (missionId === null) {
      throw new Error('Select a mission before editing advanced flight plan options.');
    }

    return missionId;
  };

  const handleFenceField = (field: keyof FenceFormState, value: string): void => {
    setFenceForm((current): FenceFormState => {
      if (current === null) {
        throw new Error(`Cannot update fence field ${field} because no fence form is open.`);
      }

      return changeFenceFormField(current, field, value);
    });
  };

  const handleFenceSelect = (fence: FenceDefinition): void => {
    setFenceForm(fenceToForm(fence, defaultCoordinate));
    setTab('fence');
    setMessage(null);
  };

  const handleSaveFence = (): void => {
    try {
      if (fenceForm === null) {
        throw new Error('Cannot save fence because no fence form is open.');
      }

      const currentMissionId = requireMissionId();
      const fence = buildFence(fenceForm);

      if (fenceForm.id === null) {
        onAddFence(currentMissionId, fence);
      } else {
        onUpdateFence(currentMissionId, fenceForm.id, fence);
      }

      setFenceForm(fenceToForm(fence, defaultCoordinate));
      setMessage(`${fence.name} saved.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleDeleteFence = (fenceId: string): void => {
    try {
      onRemoveFence(requireMissionId(), fenceId);
      setFenceForm(null);
      setMessage('Fence removed.');
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleDiscardFenceDraft = (): void => {
    if (fenceDraftSource === 'map') {
      setMapPolygonDraft(null);
    }

    if (fenceDraftSource === 'waypoints') {
      onClearSourceMissionItems();
    }

    if (activeAdvancedTool === 'drawFencePolygon' || activeAdvancedTool === 'selectFenceSource') {
      onSetAdvancedTool('select');
    }
  };

  const handleCreateFenceFromDraft = (): void => {
    if (fenceDraftSource === null) {
      return;
    }

    try {
      const currentMissionId = requireMissionId();
      const id = createAdvancedId('fence');
      const name = `Fence ${(activeAdvanced.fences.length + 1).toString()}`;
      const fence =
        fenceDraftSource === 'map'
          ? buildFenceDraftFromVertices({
              id,
              name,
              boundary: 'inclusion',
              maxAltitudeM: 120,
              vertices: fenceMapDraftVertices,
            })
          : buildFenceDraftFromMissionItems({
              id,
              name,
              boundary: 'inclusion',
              maxAltitudeM: 120,
              items: selectedSourceMissionItems,
            });

      onAddFence(currentMissionId, fence);
      setFenceForm(fenceToForm(fence, defaultCoordinate));
      setTab('fence');
      handleDiscardFenceDraft();
      setMessage(`${fence.name} created.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleTabChange = (nextTab: AdvancedPanelTab): void => {
    const targetTab: AdvancedPanelTab | null = tab === nextTab ? null : nextTab;

    if (tab === 'fence' && targetTab !== 'fence') {
      if (mapPolygonDraft?.purpose === 'fence') {
        setMapPolygonDraft(null);
      }

      if (activeAdvancedTool === 'selectFenceSource') {
        onClearSourceMissionItems();
      }

      if (activeAdvancedTool === 'drawFencePolygon' || activeAdvancedTool === 'selectFenceSource') {
        onSetAdvancedTool('select');
      }
    }

    if (tab === 'survey' && targetTab !== 'survey') {
      if (mapPolygonDraft?.purpose === 'survey') {
        setMapPolygonDraft(null);
      }

      if (activeAdvancedTool === 'selectSurveySource') {
        onClearSourceMissionItems();
      }

      if (activeAdvancedTool === 'drawSurveyPolygon' || activeAdvancedTool === 'selectSurveySource') {
        onSetAdvancedTool('select');
      }
    }

    setTab(targetTab);
  };

  const handleRallyField = (field: keyof RallyFormState, value: string): void => {
    setRallyForm((current): RallyFormState => {
      if (current === null) {
        throw new Error(`Cannot update rally field ${field} because no rally form is open.`);
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handleRallySelect = (rallyPoint: RallyPoint): void => {
    setRallyForm(rallyToForm(rallyPoint));
    setTab('rally');
    setMessage(null);
  };

  const handleCreateManualRally = (): void => {
    setRallyForm(createRallyForm(defaultCoordinate));
    setTab('rally');
    setMessage(null);
  };

  const handleSaveRally = (): void => {
    try {
      if (rallyForm === null) {
        throw new Error('Cannot save rally point because no rally form is open.');
      }

      const currentMissionId = requireMissionId();
      const rallyPoint = buildRallyPoint(rallyForm);

      if (rallyForm.id === null) {
        onAddRallyPoint(currentMissionId, rallyPoint);
      } else {
        onUpdateRallyPoint(currentMissionId, rallyForm.id, rallyPoint);
      }

      setRallyForm(rallyToForm(rallyPoint));
      setMessage(`${rallyPoint.name} saved.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleDeleteRally = (rallyPointId: string): void => {
    try {
      onRemoveRallyPoint(requireMissionId(), rallyPointId);
      setRallyForm(null);
      setMessage('Rally point removed.');
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleSurveyField = (field: keyof SurveyFormState, value: string): void => {
    try {
      if (surveyForm === null) {
        throw new Error(`Cannot update survey field ${field} because no survey form is open.`);
      }

      const nextSurveyForm: SurveyFormState = {
        ...surveyForm,
        [field]: value,
      };

      setSurveyForm(nextSurveyForm);

      if (nextSurveyForm.id === null) {
        return;
      }

      const currentMissionId = requireMissionId();
      const survey = buildSurvey(nextSurveyForm);

      onUpdateSurvey(currentMissionId, nextSurveyForm.id, survey);
      setMessage(`${survey.name} updated.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const clearSurveyDraftMode = (): void => {
    if (mapPolygonDraft?.purpose === 'survey') {
      setMapPolygonDraft(null);
    }

    if (activeAdvancedTool === 'selectSurveySource' && selectedSourceMissionItemIds.length > 0) {
      onClearSourceMissionItems();
    }

    if (activeAdvancedTool === 'drawSurveyPolygon' || activeAdvancedTool === 'selectSurveySource') {
      onSetAdvancedTool('select');
    }
  };

  const handleSurveySelect = (survey: SurveyGridSpec): void => {
    clearSurveyDraftMode();
    setSurveyForm(surveyToForm(survey));
    setTab('survey');
    setMessage(null);
  };

  const handleCreateManualSurvey = (): void => {
    try {
      const currentMissionId = requireMissionId();
      const survey = buildSurvey({
        ...createSurveyForm(seedPolygon),
        id: createAdvancedId('survey'),
        name: `Survey ${(activeAdvanced.surveys.length + 1).toString()}`,
      });

      onAddSurvey(currentMissionId, survey);
      setSurveyForm(surveyToForm(survey));
      setTab('survey');
      setMessage(`${survey.name} created.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleApplySurvey = (): void => {
    try {
      if (surveyForm === null) {
        throw new Error('Cannot add survey waypoints because no survey form is open.');
      }

      const currentMissionId = requireMissionId();
      const survey = buildSurvey(surveyForm);
      const generated = generateSurveyGrid(survey);

      onAppendMissionItems(currentMissionId, generated.missionItems);
      setMessage(`${generated.missionItems.length.toString()} survey commands added.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleDeleteSurvey = (surveyId: string): void => {
    try {
      onRemoveSurvey(requireMissionId(), surveyId);
      setSurveyForm(null);
      setMessage('Survey removed.');
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleDiscardSurveyDraft = (): void => {
    clearSurveyDraftMode();
  };

  const handleCreateSurveyFromDraft = (): void => {
    if (surveyDraftSource === null) {
      return;
    }

    try {
      const currentMissionId = requireMissionId();
      const id = createAdvancedId('survey');
      const name = `Survey ${(activeAdvanced.surveys.length + 1).toString()}`;
      const base = createSurveyForm(seedPolygon);
      const survey =
        surveyDraftSource === 'map'
          ? buildSurveyDraftFromVertices({
              id,
              name,
              altitudeM: readNumber(base.altitudeM, 'survey.altitudeM'),
              angleDeg: readNumber(base.angleDeg, 'survey.angleDeg'),
              laneSpacingM: readNumber(base.laneSpacingM, 'survey.laneSpacingM'),
              overshootM: readNumber(base.overshootM, 'survey.overshootM'),
              pattern: base.pattern,
              startCorner: base.startCorner,
              cameraTriggerMode: base.cameraTriggerMode,
              cameraTriggerDistanceM: readNumber(base.cameraTriggerDistanceM, 'survey.cameraTriggerDistanceM'),
              vertices: surveyMapDraftVertices,
            })
          : buildSurveyDraftFromMissionItems({
              id,
              name,
              altitudeM: readNumber(base.altitudeM, 'survey.altitudeM'),
              angleDeg: readNumber(base.angleDeg, 'survey.angleDeg'),
              laneSpacingM: readNumber(base.laneSpacingM, 'survey.laneSpacingM'),
              overshootM: readNumber(base.overshootM, 'survey.overshootM'),
              pattern: base.pattern,
              startCorner: base.startCorner,
              cameraTriggerMode: base.cameraTriggerMode,
              cameraTriggerDistanceM: readNumber(base.cameraTriggerDistanceM, 'survey.cameraTriggerDistanceM'),
              items: selectedSourceMissionItems,
            });

      onAddSurvey(currentMissionId, survey);
      setSurveyForm(surveyToForm(survey));
      setTab('survey');
      handleDiscardSurveyDraft();
      setMessage(`${survey.name} ready to configure.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleExport = (): void => {
    try {
      const currentMissionId = requireMissionId();
      const exported = onExportMissionJson(currentMissionId);
      setIoText(exported);
      setMessage('Exported mission JSON.');
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleImport = (): void => {
    try {
      const currentMissionId = requireMissionId();
      onImportMissionJson(currentMissionId, ioText);
      setMessage('Imported mission JSON.');
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handlePlaceRallyAtCurrentPosition = (): void => {
    setRallyForm({
      ...createRallyForm(defaultCoordinate),
      name: 'Rally from current position',
    });
    setTab('rally');
    setMessage(null);
  };

  const handlePrepareAdvancedUpload = (): void => {
    try {
      setIoText(exportAdvancedPlanToQgcWpl(activeAdvanced));
      setTab('io');
      setMessage(`${advancedUploadItems.length.toString()} ArduPilot fence/rally commands prepared.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];

    if (file === undefined) {
      return;
    }

    void file.text()
      .then((text) => {
        setIoText(text);
      })
      .catch(setErrorMessage);
  };

  return (
    <aside
      className={pinned ? 'mp-advanced mp-panel--movable' : 'mp-advanced'}
      style={panelStyle}
      aria-label="Advanced flight plan tools"
    >
      <header className="mp-advanced__header" onPointerDown={pinned ? onPanelDragStart : undefined}>
        <div>
          <div className="mp-panel-label">Advanced</div>
          <h2>Fence, Rally, Survey</h2>
        </div>
        <div className="mp-advanced__header-actions">
          <span className="mp-chip">{activeAdvanced.fences.length + activeAdvanced.rallyPoints.length + activeAdvanced.surveys.length} items</span>
          <button
            type="button"
            className={pinned ? 'mp-icon-button mp-icon-button--active' : 'mp-icon-button'}
            onClick={onTogglePin}
            title={pinned ? 'Reset advanced panel position' : 'Move advanced panel'}
            aria-label={pinned ? 'Reset advanced panel position' : 'Move advanced panel'}
          >
            <Pin size={13} />
          </button>
          <button
            type="button"
            className="mp-icon-button"
            onClick={onMinimize}
            title="Minimize advanced panel"
            aria-label="Minimize advanced panel"
          >
            <ChevronLeft size={13} />
          </button>
        </div>
      </header>

      <div className="mp-advanced__tabs" role="tablist" aria-label="Advanced planning modes">
        <button
          type="button"
          role="tab"
          className={tab === 'fence' ? 'mp-advanced-tab mp-advanced-tab--active' : 'mp-advanced-tab'}
          onClick={() => handleTabChange('fence')}
          aria-selected={tab === 'fence'}
        >
          <Pentagon size={13} />
          <span>Fence</span>
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'rally' ? 'mp-advanced-tab mp-advanced-tab--active' : 'mp-advanced-tab'}
          onClick={() => handleTabChange('rally')}
          aria-selected={tab === 'rally'}
        >
          <Flag size={13} />
          <span>Rally</span>
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'survey' ? 'mp-advanced-tab mp-advanced-tab--active' : 'mp-advanced-tab'}
          onClick={() => handleTabChange('survey')}
          aria-selected={tab === 'survey'}
        >
          <Grid3X3 size={13} />
          <span>Survey</span>
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'io' ? 'mp-advanced-tab mp-advanced-tab--active' : 'mp-advanced-tab'}
          onClick={() => handleTabChange('io')}
          aria-selected={tab === 'io'}
        >
          <FileInput size={13} />
          <span>I/O</span>
        </button>
      </div>

      {message !== null ? <div className="mp-advanced__message">{message}</div> : null}

      {tab === 'fence' ? (
        <section className="mp-advanced-section">
          <section className="mp-mode-card" aria-label="Fence placement">
            <div className="mp-mode-card__header">
              <div>
                <span>Fence</span>
              </div>
              <Pentagon size={16} aria-hidden="true" />
            </div>
            <div className="mp-mode-card__actions">
              <button
                type="button"
                className={getToolButtonClass(activeAdvancedTool === 'drawFencePolygon')}
                onClick={() => onSetAdvancedTool(activeAdvancedTool === 'drawFencePolygon' ? 'select' : 'drawFencePolygon')}
                disabled={locked || missionId === null}
                aria-label="Place fence vertices on map"
                aria-pressed={activeAdvancedTool === 'drawFencePolygon'}
              >
                <MapPinned size={13} />
                <span>Place Fence</span>
              </button>
              <button
                type="button"
                className={getToolButtonClass(activeAdvancedTool === 'selectFenceSource')}
                onClick={() => onSetAdvancedTool(activeAdvancedTool === 'selectFenceSource' ? 'select' : 'selectFenceSource')}
                disabled={locked || missionId === null}
                aria-label="Select mission waypoints for advanced layer"
                aria-pressed={activeAdvancedTool === 'selectFenceSource'}
              >
                <MapPinned size={13} />
                <span>Select WPs</span>
              </button>
            </div>
          </section>

          {fenceDraftSource !== null ? (
            <section className="mp-advanced__draft" aria-label="Fence draft">
              <div className="mp-advanced__draft-text">{fenceDraftSummary(fenceDraftSource, fenceDraftCount)}</div>
              <div className="mp-advanced__draft-actions">
                <button type="button" className="mp-button" onClick={handleDiscardFenceDraft} disabled={locked}>
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  className="mp-button mp-button--primary"
                  onClick={handleCreateFenceFromDraft}
                  disabled={locked || missionId === null || !canCreateFenceFromDraft}
                  aria-label="Create fence from draft"
                >
                  <span>Create fence</span>
                </button>
              </div>
            </section>
          ) : null}

          <div className="mp-advanced__list">
            {activeAdvanced.fences.length === 0 ? (
              <p className="mp-advanced__empty">No fences created yet.</p>
            ) : (
              activeAdvanced.fences.map((fence) => (
                <button key={fence.id} type="button" className="mp-layer-row" onClick={() => handleFenceSelect(fence)}>
                  <span>{fence.name}</span>
                  <small>{fenceSummary(fence)}</small>
                </button>
              ))
            )}
          </div>
          {fenceForm !== null ? (
            <>
              <div className="mp-form-grid mp-form-grid--two">
                <label className="mp-form-row">
                  <span>Name</span>
                  <input className="mp-input" value={fenceForm.name} onChange={(event) => handleFenceField('name', event.target.value)} disabled={locked} />
                </label>
                <label className="mp-form-row">
                  <span>Shape</span>
                  <select className="mp-input" value={fenceForm.shape} onChange={(event) => handleFenceField('shape', event.target.value)} disabled={locked}>
                    <option value="polygon">Polygon</option>
                    <option value="circle">Circle</option>
                  </select>
                </label>
                <label className="mp-form-row">
                  <span>Boundary</span>
                  <select className="mp-input" value={fenceForm.boundary} onChange={(event) => handleFenceField('boundary', event.target.value)} disabled={locked}>
                    <option value="inclusion">Inclusion</option>
                    <option value="exclusion">Exclusion</option>
                  </select>
                </label>
                <label className="mp-form-row">
                  <span>Max alt</span>
                  <input className="mp-input" type="number" value={fenceForm.maxAltitudeM} onChange={(event) => handleFenceField('maxAltitudeM', event.target.value)} disabled={locked} />
                </label>
              </div>

              {fenceForm.shape === 'polygon' ? (
                <label className="mp-form-row">
                  <span>Vertices</span>
                  <textarea className="mp-textarea" value={fenceForm.polygonText} onChange={(event) => handleFenceField('polygonText', event.target.value)} disabled={locked} />
                </label>
              ) : (
                <div className="mp-form-grid mp-form-grid--three">
                  <div className="mp-form-row mp-form-row--wide">
                    <CoordinateInput
                      className="mp-input"
                      latitude={Number.parseFloat(fenceForm.centerLat)}
                      longitude={Number.parseFloat(fenceForm.centerLng)}
                      disabled={locked}
                      onChange={(coordinate) => {
                        handleFenceField('centerLat', coordinate.lat.toFixed(6));
                        handleFenceField('centerLng', coordinate.lng.toFixed(6));
                      }}
                    />
                  </div>
                  <label className="mp-form-row">
                    <span>Radius</span>
                    <input className="mp-input" type="number" value={fenceForm.radiusM} onChange={(event) => handleFenceField('radiusM', event.target.value)} disabled={locked} />
                  </label>
                </div>
              )}

              <div className="mp-advanced__actions">
                <button type="button" className="mp-button mp-button--primary" onClick={handleSaveFence} disabled={locked || missionId === null}>
                  <Save size={13} />
                  <span>Save</span>
                </button>
                {fenceForm.id !== null ? (
                  <button type="button" className="mp-icon-button mp-icon-button--danger" onClick={() => handleDeleteFence(fenceForm.id as string)} disabled={locked}>
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === 'rally' ? (
        <section className="mp-advanced-section">
          <section className="mp-mode-card" aria-label="Rally point placement">
            <div className="mp-mode-card__header">
              <div>
                <span>Rally point</span>
                <strong>{activeAdvanced.rallyPoints.length.toString()} saved</strong>
              </div>
              <Flag size={16} aria-hidden="true" />
            </div>
            <div className="mp-mode-card__actions">
              <button
                type="button"
                className={getToolButtonClass(activeAdvancedTool === 'placeRallyPoint')}
                onClick={() => onSetAdvancedTool(activeAdvancedTool === 'placeRallyPoint' ? 'select' : 'placeRallyPoint')}
                disabled={locked || missionId === null}
                aria-label="Place rally point on map"
                aria-pressed={activeAdvancedTool === 'placeRallyPoint'}
              >
                <MapPinned size={13} />
                <span>Place on map</span>
              </button>
              <button
                type="button"
                className="mp-button"
                onClick={handlePlaceRallyAtCurrentPosition}
                disabled={locked || missionId === null}
                aria-label="Create rally point from current position"
              >
                <Flag size={13} />
                <span>Current position</span>
              </button>
              <button
                type="button"
                className="mp-button"
                onClick={handleCreateManualRally}
                disabled={locked || missionId === null}
                aria-label="Create rally point from manual coordinates"
              >
                <Flag size={13} />
                <span>Manual coordinates</span>
              </button>
            </div>
          </section>
          <div className="mp-advanced__list">
            {activeAdvanced.rallyPoints.length === 0 ? (
              <p className="mp-advanced__empty">No rally points created yet.</p>
            ) : (
              activeAdvanced.rallyPoints.map((rallyPoint) => (
                <button key={rallyPoint.id} type="button" className="mp-layer-row" onClick={() => handleRallySelect(rallyPoint)}>
                  <span>{rallyPoint.name}</span>
                  <small>{rallySummary(rallyPoint)}</small>
                </button>
              ))
            )}
          </div>
          {rallyForm !== null ? (
            <>
              <label className="mp-form-row">
                <span>Name</span>
                <input className="mp-input" value={rallyForm.name} onChange={(event) => handleRallyField('name', event.target.value)} disabled={locked} />
              </label>
              <div className="mp-form-grid mp-form-grid--three">
                <div className="mp-form-row mp-form-row--wide">
                  <CoordinateInput
                    className="mp-input"
                    latitude={Number.parseFloat(rallyForm.lat)}
                    longitude={Number.parseFloat(rallyForm.lng)}
                    disabled={locked}
                    onChange={(coordinate) => {
                      handleRallyField('lat', coordinate.lat.toFixed(6));
                      handleRallyField('lng', coordinate.lng.toFixed(6));
                    }}
                  />
                </div>
                <label className="mp-form-row">
                  <span>Alt</span>
                  <input className="mp-input" type="number" value={rallyForm.alt} onChange={(event) => handleRallyField('alt', event.target.value)} disabled={locked} />
                </label>
              </div>
              <div className="mp-form-grid mp-form-grid--three">
                <label className="mp-form-row">
                  <span>Loiter</span>
                  <input className="mp-input" type="number" value={rallyForm.loiterAltitudeM} onChange={(event) => handleRallyField('loiterAltitudeM', event.target.value)} disabled={locked} />
                </label>
                <label className="mp-form-row">
                  <span>Break</span>
                  <input className="mp-input" type="number" value={rallyForm.breakAltitudeM} onChange={(event) => handleRallyField('breakAltitudeM', event.target.value)} disabled={locked} />
                </label>
                <label className="mp-form-row">
                  <span>Heading</span>
                  <input className="mp-input" type="number" value={rallyForm.landHeadingDeg} onChange={(event) => handleRallyField('landHeadingDeg', event.target.value)} disabled={locked} />
                </label>
              </div>
              <div className="mp-advanced__actions">
                <button type="button" className="mp-button mp-button--primary" onClick={handleSaveRally} disabled={locked || missionId === null}>
                  <Save size={13} />
                  <span>Save</span>
                </button>
                {rallyForm.id !== null ? (
                  <button type="button" className="mp-icon-button mp-icon-button--danger" onClick={() => handleDeleteRally(rallyForm.id as string)} disabled={locked}>
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === 'survey' ? (
        <section className="mp-advanced-section">
          <section className="mp-mode-card" aria-label="Survey grid workflow">
            <div className="mp-mode-card__header">
              <div>
                <span>Survey grid</span>
                <strong>
                  {surveyForm === null
                    ? `${activeAdvanced.surveys.length.toString()} saved`
                    : typeof surveyPreview === 'string' || surveyPreview === null
                      ? 'Needs polygon'
                      : `${surveyPreview.metrics.laneCount.toString()} lanes`}
                </strong>
              </div>
              <Grid3X3 size={16} aria-hidden="true" />
            </div>
            <div className="mp-mode-card__actions">
              <button
                type="button"
                className={getToolButtonClass(activeAdvancedTool === 'drawSurveyPolygon')}
                onClick={() => onSetAdvancedTool(activeAdvancedTool === 'drawSurveyPolygon' ? 'select' : 'drawSurveyPolygon')}
                disabled={locked || missionId === null}
                aria-label="Draw survey area on map"
                aria-pressed={activeAdvancedTool === 'drawSurveyPolygon'}
              >
                <MapPinned size={13} />
                <span>Draw area</span>
              </button>
              <button
                type="button"
                className={getToolButtonClass(activeAdvancedTool === 'selectSurveySource')}
                onClick={() => onSetAdvancedTool(activeAdvancedTool === 'selectSurveySource' ? 'select' : 'selectSurveySource')}
                disabled={locked || missionId === null}
                aria-label="Select mission waypoints for survey area"
                aria-pressed={activeAdvancedTool === 'selectSurveySource'}
              >
                <MapPinned size={13} />
                <span>Select WPs</span>
              </button>
              <button
                type="button"
                className="mp-button"
                onClick={handleCreateManualSurvey}
                disabled={locked || missionId === null}
                aria-label="Create survey from manual coordinates"
              >
                <Grid3X3 size={13} />
                <span>Manual coordinates</span>
              </button>
            </div>
          </section>

          {surveyDraftSource !== null ? (
            <section className="mp-advanced__draft" aria-label="Survey draft">
              <div className="mp-advanced__draft-text">{fenceDraftSummary(surveyDraftSource, surveyDraftCount)}</div>
              <div className="mp-advanced__draft-actions">
                <button type="button" className="mp-button" onClick={handleDiscardSurveyDraft} disabled={locked}>
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  className="mp-button mp-button--primary"
                  onClick={handleCreateSurveyFromDraft}
                  disabled={locked || missionId === null || !canCreateSurveyFromDraft}
                  aria-label="Create survey from draft"
                >
                  <span>Create survey</span>
                </button>
              </div>
            </section>
          ) : null}

          <div className="mp-advanced__list">
            {activeAdvanced.surveys.length === 0 ? (
              <p className="mp-advanced__empty">No surveys created yet.</p>
            ) : (
              activeAdvanced.surveys.map((survey) => (
                <button key={survey.id} type="button" className="mp-layer-row" onClick={() => handleSurveySelect(survey)}>
                  <span>{survey.name}</span>
                  <small>{survey.pattern} · {survey.laneSpacingM.toString()} m</small>
                </button>
              ))
            )}
          </div>
          {surveyForm !== null ? (
            <>
              <label className="mp-form-row">
                <span>Name</span>
                <input className="mp-input" value={surveyForm.name} onChange={(event) => handleSurveyField('name', event.target.value)} disabled={locked} />
              </label>
              <label className="mp-form-row">
                <span>Polygon</span>
                <textarea className="mp-textarea" value={surveyForm.polygonText} onChange={(event) => handleSurveyField('polygonText', event.target.value)} disabled={locked} />
              </label>
              <div className="mp-form-grid mp-form-grid--three">
                <label className="mp-form-row">
                  <span>Alt</span>
                  <input className="mp-input" type="number" value={surveyForm.altitudeM} onChange={(event) => handleSurveyField('altitudeM', event.target.value)} disabled={locked} />
                </label>
                <label className="mp-form-row">
                  <span>Angle</span>
                  <input className="mp-input" type="number" value={surveyForm.angleDeg} onChange={(event) => handleSurveyField('angleDeg', event.target.value)} disabled={locked} />
                </label>
                <label className="mp-form-row">
                  <span>Spacing</span>
                  <input className="mp-input" type="number" value={surveyForm.laneSpacingM} onChange={(event) => handleSurveyField('laneSpacingM', event.target.value)} disabled={locked} />
                </label>
              </div>
              <div className="mp-form-grid mp-form-grid--three">
                <label className="mp-form-row">
                  <span>Overshoot</span>
                  <input className="mp-input" type="number" value={surveyForm.overshootM} onChange={(event) => handleSurveyField('overshootM', event.target.value)} disabled={locked} />
                </label>
                <label className="mp-form-row">
                  <span>Pattern</span>
                  <select className="mp-input" value={surveyForm.pattern} onChange={(event) => handleSurveyField('pattern', event.target.value)} disabled={locked}>
                    <option value="grid">Grid</option>
                    <option value="crosshatch">Crosshatch</option>
                  </select>
                </label>
                <label className="mp-form-row">
                  <span>Corner</span>
                  <select className="mp-input" value={surveyForm.startCorner} onChange={(event) => handleSurveyField('startCorner', event.target.value)} disabled={locked}>
                    <option value="southWest">SW</option>
                    <option value="northWest">NW</option>
                    <option value="southEast">SE</option>
                    <option value="northEast">NE</option>
                  </select>
                </label>
              </div>
              <div className="mp-form-grid mp-form-grid--two">
                <label className="mp-form-row">
                  <span>Camera</span>
                  <select className="mp-input" value={surveyForm.cameraTriggerMode} onChange={(event) => handleSurveyField('cameraTriggerMode', event.target.value)} disabled={locked}>
                    <option value="none">None</option>
                    <option value="distance">Distance</option>
                  </select>
                </label>
                <label className="mp-form-row">
                  <span>Trigger m</span>
                  <input className="mp-input" type="number" value={surveyForm.cameraTriggerDistanceM} onChange={(event) => handleSurveyField('cameraTriggerDistanceM', event.target.value)} disabled={locked || surveyForm.cameraTriggerMode === 'none'} />
                </label>
              </div>
              {typeof surveyPreview === 'string' ? (
                <div className="mp-advanced__message mp-advanced__message--error">{surveyPreview}</div>
              ) : surveyPreview === null ? null : (
                <div className="mp-advanced__metrics">
                  <span>{formatArea(surveyPreview.metrics.areaM2)}</span>
                  <span>{surveyPreview.metrics.laneCount.toString()} lanes</span>
                  <span>{formatDistance(surveyPreview.metrics.pathDistanceM)}</span>
                  <span>{surveyPreview.metrics.estimatedPhotoCount.toString()} photos</span>
                </div>
              )}
              <div className="mp-advanced__actions">
                <button type="button" className="mp-button" onClick={handleApplySurvey} disabled={locked || missionId === null || typeof surveyPreview === 'string' || surveyPreview === null}>
                  <Send size={13} />
                  <span>Add WPs</span>
                </button>
                {surveyForm.id !== null ? (
                  <button type="button" className="mp-icon-button mp-icon-button--danger" onClick={() => handleDeleteSurvey(surveyForm.id as string)} disabled={locked}>
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === 'io' ? (
        <section className="mp-advanced-section">
          <section className="mp-mode-card" aria-label="ArduPilot upload">
            <div className="mp-mode-card__header">
              <div>
                <span>ArduPilot upload</span>
                <strong>{advancedUploadItems.length.toString()} commands ready</strong>
              </div>
              <UploadCloud size={16} aria-hidden="true" />
            </div>
            <div className="mp-advanced__list">
              {advancedUploadItems.length === 0 ? (
                <p className="mp-advanced__empty">No fence or rally commands ready.</p>
              ) : (
                advancedUploadItems.map((item, index) => (
                  <div key={`${item.sourceId}-${index.toString()}`} className="mp-layer-row">
                    <span>{uploadCommandName(item)}</span>
                    <small>{item.sourceType} · {item.sourceId}</small>
                  </div>
                ))
              )}
            </div>
            <div className="mp-mode-card__actions">
              <button
                type="button"
                className="mp-button mp-button--primary"
                onClick={handlePrepareAdvancedUpload}
                disabled={advancedUploadItems.length === 0}
                aria-label="Prepare ArduPilot fence and rally upload"
              >
                <Send size={13} />
                <span>Prepare upload</span>
              </button>
            </div>
          </section>
          <div className="mp-advanced__actions">
            <button type="button" className="mp-button" onClick={handleExport}>
              <Download size={13} />
              <span>Export</span>
            </button>
            <button type="button" className="mp-button mp-button--primary" onClick={handleImport} disabled={locked || missionId === null || ioText.trim().length === 0}>
              <FileInput size={13} />
              <span>Import</span>
            </button>
          </div>
          <label className="mp-form-row">
            <span>Mission text</span>
            <textarea
              className="mp-textarea mp-textarea--io"
              value={ioText}
              onChange={(event) => setIoText(event.target.value)}
            />
          </label>
          <label className="mp-file-button mp-file-button--wide">
            <FileInput size={13} />
            <span>Open file</span>
            <input type="file" accept=".json,.txt" onChange={handleImportFile} />
          </label>
        </section>
      ) : null}
    </aside>
  );
}
