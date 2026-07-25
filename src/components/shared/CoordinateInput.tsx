import React, { useCallback, useState } from 'react';
import {
  formatCoordinateInput,
  parseCoordinatePair,
  validateCoordinateString,
} from '../../utils/coordinateFormat';
import { useUIStore } from '../../shared/store/uiStore';

interface CoordinateCoordinate {
  readonly lat: number;
  readonly lng: number;
}

interface CoordinateInputLabels {
  readonly lat?: string;
  readonly lng?: string;
  readonly coords?: string;
}

interface CoordinateInputProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly onChange: (coordinate: CoordinateCoordinate) => void;
  readonly disabled?: boolean;
  readonly hideLabels?: boolean;
  readonly labels?: CoordinateInputLabels;
  readonly className?: string;
}

interface DraftState {
  readonly lat: string;
  readonly lng: string;
  readonly grid: string;
  readonly error: string | null;
}

const DEFAULT_LABELS: Required<CoordinateInputLabels> = {
  lat: 'Lat',
  lng: 'Lng',
  coords: 'Coords',
};

const coordinateToString = (value: number): string => {
  return Number.isFinite(value) ? String(value) : '';
};

const buildKey = (format: string, latitude: number, longitude: number): string => {
  return `${format}|${coordinateToString(latitude)}|${coordinateToString(longitude)}`;
};

const deriveDraft = (format: 'geo' | 'mgrs' | 'utm', latitude: number, longitude: number): DraftState => ({
  lat: coordinateToString(latitude),
  lng: coordinateToString(longitude),
  grid: formatCoordinateInput(format, latitude, longitude),
  error: null,
});

export const CoordinateInput: React.FC<CoordinateInputProps> = ({
  latitude,
  longitude,
  onChange,
  disabled = false,
  hideLabels = false,
  labels: labelsProp,
  className = '',
}) => {
  const coordinateFormat = useUIStore((s) => s.coordinateFormat);
  const labels = { ...DEFAULT_LABELS, ...labelsProp };

  const [draft, setDraft] = useState<DraftState>(() => deriveDraft(coordinateFormat, latitude, longitude));

  // Synchronize local drafts with external prop changes during render so the
  // component stays a controlled input without a state-sync effect.
  const currentKey = buildKey(coordinateFormat, latitude, longitude);
  const [syncKey, setSyncKey] = useState(currentKey);
  if (currentKey !== syncKey) {
    setSyncKey(currentKey);
    setDraft(deriveDraft(coordinateFormat, latitude, longitude));
  }

  const commitGrid = useCallback((value: string) => {
    const validation = validateCoordinateString(coordinateFormat, value);
    if (!validation.valid) {
      setDraft((previous) => ({ ...previous, error: validation.error ?? 'Invalid coordinate' }));
      return;
    }

    const parsed = parseCoordinatePair(coordinateFormat, value);
    if (parsed == null) {
      setDraft((previous) => ({ ...previous, error: 'Invalid coordinate' }));
      return;
    }

    setDraft((previous) => ({ ...previous, error: null }));
    onChange(parsed);
  }, [coordinateFormat, onChange]);

  const commitGeo = useCallback(() => {
    const lat = Number.parseFloat(draft.lat);
    const lng = Number.parseFloat(draft.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setDraft((previous) => ({ ...previous, error: 'Invalid GEO coordinate' }));
      return;
    }
    setDraft((previous) => ({ ...previous, error: null }));
    onChange({ lat, lng });
  }, [draft.lat, draft.lng, onChange]);

  const handleGridBlur = (): void => commitGrid(draft.grid);
  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitGrid(draft.grid);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(deriveDraft(coordinateFormat, latitude, longitude));
    }
  };

  const handleGeoKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitGeo();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(deriveDraft(coordinateFormat, latitude, longitude));
    }
  };

  const inputClass = `coordinate-input ${draft.error != null ? 'coordinate-input--error' : ''} ${className}`;

  if (coordinateFormat === 'geo') {
    return (
      <div className="coordinate-input__geo-row">
        <label className="coordinate-input__label">
          {hideLabels ? null : labels.lat}
          <input
            type="number"
            step="0.000001"
            value={draft.lat}
            disabled={disabled}
            aria-label={labels.lat}
            title={draft.error ?? undefined}
            className={inputClass}
            onChange={(event) => setDraft((previous) => ({ ...previous, lat: event.target.value, error: null }))}
            onBlur={commitGeo}
            onKeyDown={handleGeoKeyDown}
          />
        </label>
        <label className="coordinate-input__label">
          {hideLabels ? null : labels.lng}
          <input
            type="number"
            step="0.000001"
            value={draft.lng}
            disabled={disabled}
            aria-label={labels.lng}
            title={draft.error ?? undefined}
            className={inputClass}
            onChange={(event) => setDraft((previous) => ({ ...previous, lng: event.target.value, error: null }))}
            onBlur={commitGeo}
            onKeyDown={handleGeoKeyDown}
          />
        </label>
      </div>
    );
  }

  return (
    <label className="coordinate-input__label coordinate-input__label--grid">
      {hideLabels ? null : labels.coords}
      <input
        type="text"
        value={draft.grid}
        disabled={disabled}
        aria-label={labels.coords}
        title={draft.error ?? `Enter ${coordinateFormat.toUpperCase()} coordinate`}
        placeholder={coordinateFormat === 'mgrs' ? '30TVK4029074257' : '30T 440290 4474257'}
        className={inputClass}
        onChange={(event) => setDraft((previous) => ({ ...previous, grid: event.target.value, error: null }))}
        onBlur={handleGridBlur}
        onKeyDown={handleGridKeyDown}
      />
    </label>
  );
};
