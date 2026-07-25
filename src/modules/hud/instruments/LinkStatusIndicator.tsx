/**
 * LinkStatusIndicator.tsx
 *
 * MAVLink radio link health indicator for the HUD bottom bar.
 *
 * Quality derived from VehicleStatusTelemetry:
 *   isConnected=false               → LOST   (red, blinking)
 *   isConnected=true, hb >1500 ms  → WEAK   (orange)
 *   isConnected=true, hb ≤1500 ms  → GOOD   (green)
 *
 * lastHeartbeatMs is the age of the last received heartbeat in milliseconds
 * as tracked by the telemetry normaliser.
 */

import React from 'react';

interface LinkStatusIndicatorProps {
  isConnected:     boolean;
  /** Age of the last received MAVLink heartbeat in milliseconds. */
  lastHeartbeatMs: number;
}

type LinkQuality = 'GOOD' | 'WEAK' | 'LOST';

function getLinkQuality(isConnected: boolean, lastHeartbeatMs: number): LinkQuality {
  if (!isConnected)          return 'LOST';
  if (lastHeartbeatMs > 1500) return 'WEAK';
  return 'GOOD';
}

const QUALITY_COLOR: Record<LinkQuality, string> = {
  GOOD: 'var(--hud-safe)',
  WEAK: 'var(--hud-warning)',
  LOST: 'var(--hud-critical)',
};

export const LinkStatusIndicator: React.FC<LinkStatusIndicatorProps> = ({
  isConnected,
  lastHeartbeatMs,
}) => {
  const quality = getLinkQuality(isConnected, lastHeartbeatMs);
  const color   = QUALITY_COLOR[quality];

  return (
    <div
      className={`hud-indicator hud-link-status ${quality === 'LOST' ? 'hud-link-status--lost' : ''}`}
      title={`Link: ${quality} · last heartbeat ${lastHeartbeatMs} ms ago`}
    >
      <span className="hud-indicator-label">LINK</span>
      <span className="hud-indicator-value" style={{ color }}>
        {quality}
      </span>
      <span className="hud-indicator-sub">
        {isConnected ? `${lastHeartbeatMs} ms` : 'offline'}
      </span>
    </div>
  );
};
