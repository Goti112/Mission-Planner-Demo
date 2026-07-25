/**
 * HomeDistanceIndicator.tsx
 *
 * Shows distance and absolute bearing to the recorded home position.
 * A Unicode arrow rotates to point toward home relative to the vehicle's
 * current heading — so the pilot immediately sees which direction to fly.
 *
 *   Arrow rotation = (bearingToHome − currentHeading + 360) % 360
 *     0°  → home straight ahead    ↑
 *     90° → home to the right      →
 *   180°  → home behind            ↓
 *   270°  → home to the left       ←
 */

import React from 'react';
import { ArrowUp } from 'lucide-react';

interface HomeDistanceIndicatorProps {
  /** Metres to home. Null when home has not been set. */
  distanceM:  number | null;
  /** Absolute bearing to home, degrees [0, 360). Null when unknown. */
  bearingDeg: number | null;
  /** Vehicle's current heading, degrees [0, 360). */
  headingDeg: number;
}

function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export const HomeDistanceIndicator: React.FC<HomeDistanceIndicatorProps> = ({
  distanceM,
  bearingDeg,
  headingDeg,
}) => {
  const hasData = distanceM !== null && bearingDeg !== null;
  const relativeDeg = hasData ? ((bearingDeg! - headingDeg + 360) % 360) : 0;

  return (
    <div
      className="hud-indicator hud-home-dist"
      title={
        hasData
          ? `Home: ${fmtDistance(distanceM!)} at ${Math.round(bearingDeg!)}°`
          : 'Home position not set'
      }
    >
      <span className="hud-indicator-label">HOME</span>
      <div className="hud-home-row">
        <span
          className="hud-home-arrow"
          style={{ transform: `rotate(${relativeDeg}deg)` }}
          aria-hidden="true"
        >
          <ArrowUp size={14} />
        </span>
        <span className="hud-indicator-value">
          {hasData ? fmtDistance(distanceM!) : '--'}
        </span>
      </div>
      <span className="hud-indicator-sub">
        {hasData ? `${Math.round(bearingDeg!)}°` : '--'}
      </span>
    </div>
  );
};
