import React from 'react';
import { CoordinateDisplay } from '../../../components/shared/CoordinateDisplay';

interface CoordinatesIndicatorProps {
  readonly latitude: number;
  readonly longitude: number;
}

export const CoordinatesIndicator: React.FC<CoordinatesIndicatorProps> = ({
  latitude,
  longitude,
}) => {
  return (
    <div
      className="hud-indicator hud-coordinates"
      title={`GPS Position: ${latitude.toFixed(7)}°, ${longitude.toFixed(7)}°`}
    >
      <span className="hud-indicator-label">GPS COORDS</span>
      <CoordinateDisplay latitude={latitude} longitude={longitude} />
    </div>
  );
};
