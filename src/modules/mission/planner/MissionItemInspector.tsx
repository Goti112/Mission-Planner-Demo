import { ChevronRight, Pin, SlidersHorizontal } from 'lucide-react';
import type { CSSProperties, PointerEvent } from 'react';
import type { MissionCoordinate, MissionFrame, MissionItem } from '../domain';
import { getMissionCommandDefinition } from '../domain';
import {
  isIncompleteNumericInput,
  PARAM_INDEXES,
  parseFiniteNumber,
  updateCoordinateField,
  updateParamAtIndex,
} from './missionItemEditing';
import type { MissionIssueBadge } from './missionPlanPresentation';
import { getMissionCommandLabel } from './missionPlanPresentation';

export interface MissionItemInspectorProps {
  readonly item: MissionItem | null;
  readonly defaultCoordinate: MissionCoordinate;
  readonly issues: readonly MissionIssueBadge[];
  readonly locked: boolean;
  readonly onUpdateItem: (
    itemId: string,
    patch: Partial<Omit<MissionItem, 'id' | 'seq'>>,
  ) => void;
  readonly onMinimize: () => void;
  readonly pinned: boolean;
  readonly panelStyle: CSSProperties | undefined;
  readonly onTogglePin: () => void;
  readonly onPanelDragStart: (event: PointerEvent<HTMLElement>) => void;
}

const parseSupportedFrame = (
  value: string,
  supportedFrames: readonly MissionFrame[],
): MissionFrame | null => {
  const frame = supportedFrames.find((supportedFrame) => supportedFrame === value);

  return frame ?? null;
};

const itemIssues = (
  issues: readonly MissionIssueBadge[],
  item: MissionItem,
): readonly MissionIssueBadge[] =>
  issues.filter((issue) => issue.itemId === item.id || (issue.itemId === null && issue.seq === item.seq));

export default function MissionItemInspector({
  item,
  defaultCoordinate,
  issues,
  locked,
  onUpdateItem,
  onMinimize,
  pinned,
  panelStyle,
  onTogglePin,
  onPanelDragStart,
}: MissionItemInspectorProps) {
  if (item === null) {
    return (
      <aside
        className={pinned ? 'mp-inspector mp-panel--movable' : 'mp-inspector'}
        style={panelStyle}
        aria-label="Mission item inspector"
      >
        <header className="mp-inspector__header" onPointerDown={pinned ? onPanelDragStart : undefined}>
          <div>
            <div className="mp-panel-label">Command</div>
            <h2>Select command</h2>
          </div>
          <div className="mp-inspector__header-actions">
            <button
              type="button"
              className={pinned ? 'mp-icon-button mp-icon-button--active' : 'mp-icon-button'}
              onClick={onTogglePin}
              title={pinned ? 'Reset command panel position' : 'Move command panel'}
              aria-label={pinned ? 'Reset command panel position' : 'Move command panel'}
            >
              <Pin size={13} />
            </button>
            <button
              type="button"
              className="mp-icon-button"
              onClick={onMinimize}
              title="Minimize command panel"
              aria-label="Minimize command panel"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </header>
        <div className="mp-inspector__empty">
          <SlidersHorizontal size={18} />
          <span>Select command</span>
        </div>
      </aside>
    );
  }

  const definition = getMissionCommandDefinition(item.command);
  const visibleIssues = itemIssues(issues, item);

  const handleParamChange = (index: number, rawValue: string): void => {
    if (locked) {
      return;
    }

    const value = rawValue.trim() === '' ? null : parseFiniteNumber(rawValue);

    if (value === null && rawValue.trim() !== '') {
      return;
    }

    const params = updateParamAtIndex(item.params, index, value);

    if (definition.hasCoordinate && value !== null && index >= 4) {
      const coordinateField = index === 4 ? 'lat' : index === 5 ? 'lng' : 'alt';
      const coordinate = updateCoordinateField(item.coordinate, defaultCoordinate, coordinateField, value);
      onUpdateItem(item.id, { params, coordinate });
      return;
    }

    onUpdateItem(item.id, { params });
  };

  const handleCoordinateChange = (field: keyof MissionCoordinate, rawValue: string): void => {
    if (locked || isIncompleteNumericInput(rawValue)) {
      return;
    }

    const value = parseFiniteNumber(rawValue);

    if (value === null) {
      return;
    }

    const coordinate = updateCoordinateField(item.coordinate, defaultCoordinate, field, value);
    onUpdateItem(item.id, { coordinate });
  };

  const handleFrameChange = (rawValue: string): void => {
    if (locked) {
      return;
    }

    const frame = parseSupportedFrame(rawValue, definition.supportedFrames);

    if (frame === null) {
      throw new Error(`Unsupported frame ${rawValue} for mission command ${item.command}.`);
    }

    onUpdateItem(item.id, { frame });
  };

  return (
    <aside
      className={pinned ? 'mp-inspector mp-panel--movable' : 'mp-inspector'}
      style={panelStyle}
      aria-label="Mission item inspector"
    >
      <header className="mp-inspector__header" onPointerDown={pinned ? onPanelDragStart : undefined}>
        <div>
          <div className="mp-panel-label">Command</div>
          <h2>{getMissionCommandLabel(item.command)}</h2>
        </div>
        <div className="mp-inspector__header-actions">
          <span className="mp-seq-badge">#{item.seq + 1}</span>
          <button
            type="button"
            className={pinned ? 'mp-icon-button mp-icon-button--active' : 'mp-icon-button'}
            onClick={onTogglePin}
            title={pinned ? 'Reset command panel position' : 'Move command panel'}
            aria-label={pinned ? 'Reset command panel position' : 'Move command panel'}
          >
            <Pin size={13} />
          </button>
          <button
            type="button"
            className="mp-icon-button"
            onClick={onMinimize}
            title="Minimize command panel"
            aria-label="Minimize command panel"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </header>

      {visibleIssues.length > 0 && (
        <div className="mp-inspector__issues">
          {visibleIssues.map((issue) => (
            <span key={`${issue.tone}-${issue.seq ?? 'plan'}-${issue.message}`} className={`mp-badge mp-badge--${issue.tone}`}>
              {issue.seq === null ? issue.message : `#${issue.seq + 1} ${issue.message}`}
            </span>
          ))}
        </div>
      )}

      <div className="mp-inspector__grid">
        <label className="mp-form-row">
          <span>Frame</span>
          <select
            value={item.frame}
            onChange={(event) => handleFrameChange(event.target.value)}
            className="mp-input"
            disabled={locked}
          >
            {definition.supportedFrames.map((frame) => (
              <option key={frame} value={frame}>
                {frame}
              </option>
            ))}
          </select>
        </label>

        <label className="mp-checkbox-row">
          <input
            type="checkbox"
            checked={item.autocontinue}
            onChange={(event) => {
              if (!locked) {
                onUpdateItem(item.id, { autocontinue: event.target.checked });
              }
            }}
            disabled={locked}
          />
          <span>Autocontinue</span>
        </label>
      </div>

      {definition.hasCoordinate && (
        <div className="mp-inspector__grid mp-inspector__grid--coords">
          <label className="mp-form-row">
            <span>Lat</span>
            <input
              type="number"
              step="0.000001"
              value={item.coordinate?.lat ?? ''}
              placeholder={defaultCoordinate.lat.toString()}
              onChange={(event) => handleCoordinateChange('lat', event.target.value)}
              className="mp-input"
              disabled={locked}
            />
          </label>
          <label className="mp-form-row">
            <span>Lng</span>
            <input
              type="number"
              step="0.000001"
              value={item.coordinate?.lng ?? ''}
              placeholder={defaultCoordinate.lng.toString()}
              onChange={(event) => handleCoordinateChange('lng', event.target.value)}
              className="mp-input"
              disabled={locked}
            />
          </label>
          <label className="mp-form-row">
            <span>Alt</span>
            <input
              type="number"
              step="1"
              value={item.coordinate?.alt ?? ''}
              placeholder={defaultCoordinate.alt.toString()}
              onChange={(event) => handleCoordinateChange('alt', event.target.value)}
              className="mp-input"
              disabled={locked}
            />
          </label>
        </div>
      )}

      <div className="mp-param-list">
        {PARAM_INDEXES.map((index) => {
          const paramDefinition = definition.params[index];

          if (paramDefinition === undefined) {
            throw new Error(`Mission command ${item.command} has no param definition at index ${index}.`);
          }

          const value = item.params[index];

          return (
            <label key={paramDefinition.index} className="mp-param-row">
              <span>
                P{paramDefinition.index} {paramDefinition.label}
                {paramDefinition.unit === null ? '' : ` (${paramDefinition.unit})`}
              </span>
              <input
                type="number"
                value={value === null ? '' : value}
                placeholder={paramDefinition.required ? 'Required' : '-'}
                onChange={(event) => handleParamChange(index, event.target.value)}
                className="mp-input"
                disabled={locked}
              />
            </label>
          );
        })}
      </div>
    </aside>
  );
}
