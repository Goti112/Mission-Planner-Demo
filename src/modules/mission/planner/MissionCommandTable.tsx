import { ChevronDown, GripVertical, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent, FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import type { ReactElement } from 'react';
import { useUIStore } from '../../../shared/store/uiStore';
import { CoordinateInput } from '../../../components/shared/CoordinateInput';
import type { MissionCommand, MissionCoordinate, MissionItem, MissionParamValue, MissionTableRow } from '../domain';
import {
  coordinateFromMissionTableRow,
  isIncompleteNumericInput,
  paramsFromMissionTableRow,
  parseFiniteNumber,
  updateCoordinateField,
  updateParamAtIndex,
  type MissionItemPatch,
} from './missionItemEditing';
import {
  formatMissionAltitude,
  formatMissionNumber,
  getMissionCommandLabel,
  getMissionCommandShortLabel,
} from './missionPlanPresentation';
import { getMissionTableSegmentMetrics } from './missionTableMetrics';

export interface MissionCommandTableProps {
  readonly rows: readonly MissionTableRow[];
  readonly navCommands: readonly MissionCommand[];
  readonly selectedItemId: string | null;
  readonly defaultCoordinate: MissionCoordinate;
  readonly locked: boolean;
  readonly sourceSelectionEnabled: boolean;
  readonly selectedSourceItemIds: readonly string[];
  readonly onSelectItem: (itemId: string) => void;
  readonly onToggleSourceItem: (itemId: string) => void;
  readonly onChangeItemCommand: (itemId: string, command: MissionCommand) => void;
  readonly onUpdateItem: (
    itemId: string,
    patch: Partial<Omit<MissionItem, 'id' | 'seq'>>,
  ) => void;
  readonly onRemoveItem: (itemId: string) => void;
  readonly onReorderItem: (fromIndex: number, toIndex: number) => void;
}

type EditableCellField = 'param1' | 'param2' | 'param3' | 'param4' | 'alt';

interface EditingCell {
  readonly itemId: string;
  readonly field: EditableCellField;
}

interface OpenCommandMenu {
  readonly itemId: string;
}

interface EditableCellConfig {
  readonly field: EditableCellField;
  readonly label: string;
  readonly value: MissionParamValue;
  readonly step: string;
  readonly displayValue: string;
}

const PARAM_FIELD_INDEXES: Readonly<Record<Extract<EditableCellField, 'param1' | 'param2' | 'param3' | 'param4'>, number>> = {
  param1: 0,
  param2: 1,
  param3: 2,
  param4: 3,
};

const parseDragIndex = (value: string): number => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Mission command table received invalid drag index: ${value}.`);
  }

  return parsed;
};

const editableCellInputValue = (value: MissionParamValue): string => (value === null ? '' : value.toString());

const isEditingCell = (editingCell: EditingCell | null, itemId: string, field: EditableCellField): boolean =>
  editingCell !== null && editingCell.itemId === itemId && editingCell.field === field;

const buildEditableCellPatch = (
  row: MissionTableRow,
  defaultCoordinate: MissionCoordinate,
  field: EditableCellField,
  rawValue: string,
): MissionItemPatch | null => {
  if (isIncompleteNumericInput(rawValue)) {
    return null;
  }

  if (field === 'alt') {
    const value = parseFiniteNumber(rawValue);

    if (value === null) {
      return null;
    }

    return {
      coordinate: updateCoordinateField(coordinateFromMissionTableRow(row), defaultCoordinate, field, value),
    };
  }

  const value = rawValue.trim() === '' ? null : parseFiniteNumber(rawValue);

  if (value === null && rawValue.trim() !== '') {
    return null;
  }

  return {
    params: updateParamAtIndex(paramsFromMissionTableRow(row), PARAM_FIELD_INDEXES[field], value),
  };
};

const buildCoordinatePatch = (
  row: MissionTableRow,
  defaultCoordinate: MissionCoordinate,
  coordinate: Pick<MissionCoordinate, 'lat' | 'lng'>,
): MissionItemPatch => ({
  coordinate: {
    lat: coordinate.lat,
    lng: coordinate.lng,
    alt: row.alt ?? defaultCoordinate.alt,
  },
});

export default function MissionCommandTable({
  rows,
  navCommands,
  selectedItemId,
  defaultCoordinate,
  locked,
  sourceSelectionEnabled,
  selectedSourceItemIds,
  onSelectItem,
  onToggleSourceItem,
  onChangeItemCommand,
  onUpdateItem,
  onRemoveItem,
  onReorderItem,
}: MissionCommandTableProps) {
  const coordinateFormat = useUIStore((state) => state.coordinateFormat);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [openCommandMenu, setOpenCommandMenu] = useState<OpenCommandMenu | null>(null);

  const handleDragStart = (event: DragEvent<HTMLTableRowElement>, index: number): void => {
    if (locked) {
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDrop = (event: DragEvent<HTMLTableRowElement>, toIndex: number): void => {
    event.preventDefault();

    if (locked) {
      return;
    }

    const fromIndex = parseDragIndex(event.dataTransfer.getData('text/plain'));

    if (fromIndex !== toIndex) {
      onReorderItem(fromIndex, toIndex);
    }
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, itemId: string): void => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    onSelectItem(itemId);
  };

  const startCellEdit = useCallback(
    (
      event: MouseEvent<HTMLTableCellElement>,
      row: MissionTableRow,
      field: EditableCellField,
      value: MissionParamValue,
    ): void => {
      event.stopPropagation();

      if (locked) {
        return;
      }

      setEditingCell({ itemId: row.id, field });
      setDraftValue(editableCellInputValue(value));
    },
    [locked],
  );

  const stopCellEvent = (event: MouseEvent<HTMLTableCellElement>): void => {
    event.stopPropagation();
  };

  const validateNavCommand = (
    itemId: string,
    command: MissionCommand,
  ): MissionCommand => {
    const supportedCommand = navCommands.find((navCommand) => navCommand === command);

    if (supportedCommand === undefined) {
      throw new Error(`Mission command table received unsupported nav command ${command} for item ${itemId}.`);
    }

    return supportedCommand;
  };

  const handleToggleCommandMenu = (
    event: MouseEvent<HTMLButtonElement>,
    row: MissionTableRow,
  ): void => {
    event.stopPropagation();

    if (locked) {
      return;
    }

    setOpenCommandMenu((currentMenu) =>
      currentMenu?.itemId === row.id ? null : { itemId: row.id },
    );
  };

  const handleChooseCommand = (
    event: MouseEvent<HTMLButtonElement>,
    row: MissionTableRow,
    command: MissionCommand,
  ): void => {
    event.stopPropagation();

    if (locked) {
      return;
    }

    onChangeItemCommand(row.id, validateNavCommand(row.id, command));
    setOpenCommandMenu(null);
  };

  const handleCommandCellBlur = (event: FocusEvent<HTMLTableCellElement>): void => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setOpenCommandMenu(null);
  };

  const handleCommandCellKeyDown = (event: KeyboardEvent<HTMLTableCellElement>): void => {
    if (event.key !== 'Escape') {
      return;
    }

    event.stopPropagation();
    setOpenCommandMenu(null);
  };

  const cancelCellEdit = (): void => {
    setEditingCell(null);
    setDraftValue('');
  };

  const commitCellEdit = useCallback(
    (row: MissionTableRow, field: EditableCellField, rawValue: string): void => {
      if (locked) {
        cancelCellEdit();
        return;
      }

      const patch = buildEditableCellPatch(row, defaultCoordinate, field, rawValue);

      if (patch === null) {
        return;
      }

      onUpdateItem(row.id, patch);
      cancelCellEdit();
    },
    [defaultCoordinate, locked, onUpdateItem],
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDraftValue(event.currentTarget.value);
  };

  const handleInputBlur = (
    event: FocusEvent<HTMLInputElement>,
    row: MissionTableRow,
    field: EditableCellField,
  ): void => {
    commitCellEdit(row, field, event.currentTarget.value);
  };

  const handleInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    row: MissionTableRow,
    field: EditableCellField,
  ): void => {
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelCellEdit();
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    commitCellEdit(row, field, event.currentTarget.value);
  };

  const renderEditableCell = (row: MissionTableRow, config: EditableCellConfig): ReactElement => {
    const isEditing = isEditingCell(editingCell, row.id, config.field);

    return (
      <td
        className={isEditing ? 'mp-command-table__editable-cell mp-command-table__editable-cell--editing' : 'mp-command-table__editable-cell'}
        aria-label={`Edit ${config.label} for command ${row.seq + 1}`}
        onClick={stopCellEvent}
        onDoubleClick={(event) => startCellEdit(event, row, config.field, config.value)}
      >
        {isEditing ? (
          <input
            type="number"
            step={config.step}
            value={draftValue}
            className="mp-command-table__cell-input"
            aria-label={`${config.label} value for command ${row.seq + 1}`}
            disabled={locked}
            autoFocus
            onChange={handleInputChange}
            onBlur={(event) => handleInputBlur(event, row, config.field)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleInputKeyDown(event, row, config.field)}
          />
        ) : (
          config.displayValue
        )}
      </td>
    );
  };

  const renderCommandCell = (row: MissionTableRow): ReactElement => {
    const canChangeNavCommand = navCommands.some((command) => command === row.command);
    const commandMenuOpen = openCommandMenu?.itemId === row.id;

    if (!canChangeNavCommand) {
      return <td className="mp-command-table__command">{getMissionCommandShortLabel(row.command)}</td>;
    }

    return (
      <td
        className="mp-command-table__command mp-command-table__command-cell"
        onClick={stopCellEvent}
        onBlur={handleCommandCellBlur}
        onKeyDown={handleCommandCellKeyDown}
      >
        <span
          className={
            locked
              ? 'mp-command-table__command-control mp-command-table__command-control--disabled'
              : 'mp-command-table__command-control'
          }
        >
          <button
            type="button"
            className="mp-command-table__command-picker"
            disabled={locked}
            aria-label={`Change nav command for command ${row.seq + 1}`}
            aria-haspopup="menu"
            aria-expanded={commandMenuOpen}
            title={getMissionCommandLabel(row.command)}
            onClick={(event) => handleToggleCommandMenu(event, row)}
          >
            <span>{getMissionCommandShortLabel(row.command)}</span>
          </button>
          <ChevronDown className="mp-command-table__command-chevron" size={12} aria-hidden="true" />
        </span>
        {commandMenuOpen ? (
          <div
            className="mp-command-table__command-menu"
            role="menu"
            aria-label={`Nav command choices for command ${row.seq + 1}`}
          >
            {navCommands.map((command) => (
              <button
                key={command}
                type="button"
                className={
                  command === row.command
                    ? 'mp-command-table__command-menu-item mp-command-table__command-menu-item--active'
                    : 'mp-command-table__command-menu-item'
                }
                role="menuitem"
                title={getMissionCommandLabel(command)}
                aria-label={`Change command ${row.seq + 1} to ${getMissionCommandShortLabel(command)}`}
                onClick={(event) => handleChooseCommand(event, row, command)}
              >
                {getMissionCommandShortLabel(command)}
              </button>
            ))}
          </div>
        ) : null}
      </td>
    );
  };

  const renderCoordinateCell = (row: MissionTableRow): ReactElement => (
    <td
      className="mp-command-table__coordinate mp-command-table__coordinate--editable"
      onClick={stopCellEvent}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <CoordinateInput
        className="mp-input mp-command-table__coordinate-input"
        latitude={row.lat ?? 0}
        longitude={row.lng ?? 0}
        disabled={locked || row.lat === null || row.lng === null}
        hideLabels
        labels={coordinateFormat === 'geo' ? undefined : { coords: coordinateFormat.toUpperCase() }}
        onChange={(coordinate) => {
          if (row.lat === null || row.lng === null) return;
          onUpdateItem(row.id, buildCoordinatePatch(row, defaultCoordinate, coordinate));
        }}
      />
    </td>
  );

  return (
    <div className="mp-table-panel" aria-label="Mission command table">
      <div className="mp-table-scroll">
        <table className="mp-command-table">
          <thead>
            <tr>
              {sourceSelectionEnabled ? <th className="mp-command-table__source-cell">Layer</th> : null}
              <th aria-label="Drag" />
              <th>Comandos</th>
              <th>P1</th>
              <th>P2</th>
              <th>P3</th>
              <th>P4</th>
              <th>Alt</th>
              <th>{coordinateFormat.toUpperCase()}</th>
              <th>Borrar</th>
              <th>Grad %</th>
              <th>Angle</th>
              <th>Dist</th>
              <th>AZ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="mp-table-empty" colSpan={sourceSelectionEnabled ? 14 : 13}>
                  No commands
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const selected = row.id === selectedItemId;
                const segmentMetrics = getMissionTableSegmentMetrics(rows, index, coordinateFormat);

                return (
                  <tr
                    key={row.id}
                    className={selected ? 'mp-command-table__row mp-command-table__row--selected' : 'mp-command-table__row'}
                    draggable={!locked}
                    tabIndex={0}
                    aria-selected={selected}
                    onDragStart={(event) => handleDragStart(event, index)}
                    onDragOver={(event) => {
                      if (!locked) {
                        event.preventDefault();
                      }
                    }}
                    onDrop={(event) => handleDrop(event, index)}
                    onClick={() => onSelectItem(row.id)}
                    onKeyDown={(event) => handleRowKeyDown(event, row.id)}
                  >
                    {sourceSelectionEnabled ? (
                      <td
                        className="mp-command-table__source-cell"
                        onClick={(event) => event.stopPropagation()}
                        onDragStart={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSourceItemIds.includes(row.id)}
                          aria-label={`Use command ${row.seq + 1} as advanced layer source`}
                          disabled={locked || row.lat === null || row.lng === null}
                          onChange={() => onToggleSourceItem(row.id)}
                          onClick={(event) => event.stopPropagation()}
                          onDragStart={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        />
                      </td>
                    ) : null}
                    <td className="mp-command-table__drag">
                      <GripVertical size={13} />
                    </td>
                    {renderCommandCell(row)}
                    {renderEditableCell(row, {
                      field: 'param1',
                      label: 'P1',
                      value: row.param1,
                      step: '0.01',
                      displayValue: formatMissionNumber(row.param1, 2),
                    })}
                    {renderEditableCell(row, {
                      field: 'param2',
                      label: 'P2',
                      value: row.param2,
                      step: '0.01',
                      displayValue: formatMissionNumber(row.param2, 2),
                    })}
                    {renderEditableCell(row, {
                      field: 'param3',
                      label: 'P3',
                      value: row.param3,
                      step: '0.01',
                      displayValue: formatMissionNumber(row.param3, 2),
                    })}
                    {renderEditableCell(row, {
                      field: 'param4',
                      label: 'P4',
                      value: row.param4,
                      step: '0.01',
                      displayValue: formatMissionNumber(row.param4, 2),
                    })}
                    {renderEditableCell(row, {
                      field: 'alt',
                      label: 'Alt',
                      value: row.alt,
                      step: '1',
                      displayValue: formatMissionAltitude(row.alt),
                    })}
                    {renderCoordinateCell(row)}
                    <td className="mp-command-table__action-cell">
                      <button
                        type="button"
                        className="mp-icon-button mp-icon-button--danger"
                        disabled={locked}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveItem(row.id);
                        }}
                        title="Remove command"
                        aria-label={`Remove command ${row.seq + 1}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                    <td className="mp-command-table__metric">{segmentMetrics.gradePercent}</td>
                    <td className="mp-command-table__metric">{segmentMetrics.angleDegrees}</td>
                    <td className="mp-command-table__metric">{segmentMetrics.distance}</td>
                    <td className="mp-command-table__metric">{segmentMetrics.azimuthDegrees}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
