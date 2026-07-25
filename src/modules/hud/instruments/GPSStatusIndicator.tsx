/**
 * GPSStatusIndicator.tsx
 *
 * Indicador de estado del receptor GPS.
 *
 * Muestra: tipo de fix, número de satélites, HDOP.
 * Color codificado por calidad de fix.
 */

import React from 'react';
import type { GPSStatusTelemetry } from '../../telemetry';
import { GPSFixType } from '../../telemetry';

interface GPSStatusIndicatorProps {
  gpsStatus: GPSStatusTelemetry;
}

const FIX_LABELS: Record<number, string> = {
  [GPSFixType.NO_GPS]:    'NO GPS',
  [GPSFixType.NO_FIX]:    'NO FIX',
  [GPSFixType.FIX_2D]:    '2D',
  [GPSFixType.FIX_3D]:    '3D',
  [GPSFixType.DGPS]:      'DGPS',
  [GPSFixType.RTK_FLOAT]: 'RTK~',
  [GPSFixType.RTK_FIXED]: 'RTK',
  [GPSFixType.STATIC]:    'STATIC',
  [GPSFixType.PPP]:       'PPP',
};

function getFixColor(fixType: number): string {
  if (fixType >= GPSFixType.RTK_FLOAT) return 'var(--hud-accent)';
  if (fixType >= GPSFixType.FIX_3D)   return 'var(--hud-safe)';
  if (fixType >= GPSFixType.FIX_2D)   return 'var(--hud-warning)';
  return 'var(--hud-critical)';
}

export const GPSStatusIndicator: React.FC<GPSStatusIndicatorProps> = ({ gpsStatus }) => {
  const { fixType, satellitesVisible, hdop } = gpsStatus;
  const fixLabel = FIX_LABELS[fixType] ?? 'UNK';
  const fixColor = getFixColor(fixType);

  const hdopLabel = hdop !== null ? hdop.toFixed(1) : '--';

  return (
    <div
      className="hud-indicator hud-gps-status"
      title={`GPS: ${fixLabel} · ${satellitesVisible} sats · HDOP ${hdopLabel}`}
    >
      <span className="hud-indicator-label">GPS</span>
      <span className="hud-indicator-value" style={{ color: fixColor }}>
        {fixLabel}
      </span>
      <span className="hud-indicator-sub">
        {satellitesVisible}✦ {hdopLabel !== '--' ? `H${hdopLabel}` : ''}
      </span>
    </div>
  );
};
