import React, { useState, useRef } from 'react';
import { Plus, Minus } from 'lucide-react';
import './MapZoomControl.css';

interface MapZoomControlProps {
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  onZoomChange: (newZoom: number) => void;
  className?: string;
}

type ZoomControlStyle = React.CSSProperties & {
  '--zoom-progress': string;
};

const DEFAULT_MIN_ZOOM = 1;
const DEFAULT_MAX_ZOOM = 22;
const ZOOM_STEP = 0.1;
const BUTTON_ZOOM_STEP = 1;

function clampZoom(value: number, minZoom: number, maxZoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, value));
}

function calculateProgress(value: number, minZoom: number, maxZoom: number): number {
  const range = maxZoom - minZoom;
  if (range <= 0) return 100;
  return ((value - minZoom) / range) * 100;
}

/**
 * Professional vertical zoom control for ROHU GCS maps.
 * Integrates with both 2D (Mapbox) and 3D (Cesium) views.
 */
export const MapZoomControl: React.FC<MapZoomControlProps> = ({
  zoom,
  minZoom,
  maxZoom,
  onZoomChange,
  className,
}) => {
  const resolvedMinZoom = minZoom ?? DEFAULT_MIN_ZOOM;
  const resolvedMaxZoom = Math.max(resolvedMinZoom, maxZoom ?? DEFAULT_MAX_ZOOM);
  const [dragZoom, setDragZoom] = useState<number | null>(null);
  const isInteracting = useRef(false);
  const internalZoom = dragZoom ?? clampZoom(zoom, resolvedMinZoom, resolvedMaxZoom);

  const setInteractionActive = (): void => {
    isInteracting.current = true;
    setDragZoom(clampZoom(zoom, resolvedMinZoom, resolvedMaxZoom));
  };

  const setInteractionIdle = (): void => {
    isInteracting.current = false;
    setDragZoom(null);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = clampZoom(parseFloat(e.target.value), resolvedMinZoom, resolvedMaxZoom);
    setDragZoom(value);
    onZoomChange(value);
  };

  const handleIncrement = (): void => {
    const next = Math.min(resolvedMaxZoom, internalZoom + BUTTON_ZOOM_STEP);
    setDragZoom(null);
    onZoomChange(next);
  };

  const handleDecrement = (): void => {
    const next = Math.max(resolvedMinZoom, internalZoom - BUTTON_ZOOM_STEP);
    setDragZoom(null);
    onZoomChange(next);
  };

  const progress = calculateProgress(internalZoom, resolvedMinZoom, resolvedMaxZoom);
  const controlClassName = ['map-zoom-control', className].filter(Boolean).join(' ');
  const sliderStyle: ZoomControlStyle = { '--zoom-progress': `${progress}%` };

  return (
    <div className={controlClassName} aria-label="Control de zoom del mapa">
      <div className="map-zoom-readout" aria-live="polite">
        <span className="map-zoom-readout__label">ZOOM</span>
        <span className="map-zoom-readout__value">{internalZoom.toFixed(1)}</span>
      </div>

      <button
        className="map-zoom-btn map-zoom-btn--plus"
        onClick={handleIncrement}
        disabled={internalZoom >= resolvedMaxZoom}
        title="Acercar (Zoom In)"
        aria-label="Acercar mapa"
        type="button"
      >
        <Plus size={15} strokeWidth={2.4} />
      </button>

      <div className="map-zoom-slider-container">
        <div className="map-zoom-rail" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <input
          type="range"
          min={resolvedMinZoom}
          max={resolvedMaxZoom}
          step={ZOOM_STEP}
          value={internalZoom}
          onChange={handleSliderChange}
          onPointerDown={setInteractionActive}
          onPointerUp={setInteractionIdle}
          onPointerCancel={setInteractionIdle}
          onBlur={setInteractionIdle}
          className="map-zoom-slider"
          style={sliderStyle}
          aria-label="Nivel de zoom"
        />
      </div>

      <button
        className="map-zoom-btn map-zoom-btn--minus"
        onClick={handleDecrement}
        disabled={internalZoom <= resolvedMinZoom}
        title="Alejar (Zoom Out)"
        aria-label="Alejar mapa"
        type="button"
      >
        <Minus size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
};

export default MapZoomControl;
