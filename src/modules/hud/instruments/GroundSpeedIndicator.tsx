/**
 * GroundSpeedIndicator.tsx
 *
 * Compact ground-speed (and optional IAS) readout for the HUD bottom bar.
 *
 * Ground Speed (GS) — GPS/EKF-derived speed over ground.
 * Air Speed    (IAS, sub-label) — pitot-tube indicated airspeed.
 *              Hidden when null (no pitot present).
 */

import React from 'react';

interface GroundSpeedIndicatorProps {
  groundSpeedMs: number;
  /** Null when no airspeed sensor is fitted. */
  airSpeedMs:    number | null;
}

export const GroundSpeedIndicator: React.FC<GroundSpeedIndicatorProps> = ({
  groundSpeedMs,
  airSpeedMs,
}) => {
  return (
    <div
      className="hud-indicator hud-ground-speed"
      title={`Ground Speed: ${groundSpeedMs.toFixed(1)} m/s${airSpeedMs !== null ? ` · IAS: ${airSpeedMs.toFixed(1)} m/s` : ''}`}
    >
      <span className="hud-indicator-label">GND SPD</span>
      <span className="hud-indicator-value">
        {groundSpeedMs.toFixed(1)}
        <span className="hud-speed-unit"> m/s</span>
      </span>
      {airSpeedMs !== null && (
        <span className="hud-indicator-sub">
          IAS {airSpeedMs.toFixed(1)}
        </span>
      )}
    </div>
  );
};
