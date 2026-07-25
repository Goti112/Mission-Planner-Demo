/**
 * BatteryIndicator.tsx
 *
 * Indicador de batería principal.
 *
 * Muestra voltaje, porcentaje y corriente.
 * Barra de progreso con color dinámico por nivel.
 * Parpadeo CSS cuando está en CRITICAL.
 */

import React from 'react';
import type { BatteryTelemetry } from '../../telemetry';
import { BatteryWarningLevel } from '../../telemetry';

interface BatteryIndicatorProps {
  battery: BatteryTelemetry;
}

const LEVEL_COLORS: Record<BatteryWarningLevel, string> = {
  [BatteryWarningLevel.NORMAL]:   'var(--hud-safe)',
  [BatteryWarningLevel.LOW]:      'var(--hud-warning)',
  [BatteryWarningLevel.CRITICAL]: 'var(--hud-critical)',
  [BatteryWarningLevel.UNKNOWN]:  'var(--hud-text-dim)',
};

export const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({ battery }) => {
  const { voltageV, currentA, remainingPercent, warningLevel } = battery;
  const color = LEVEL_COLORS[warningLevel];
  const pct   = remainingPercent ?? 0;
  const isCritical = warningLevel === BatteryWarningLevel.CRITICAL;

  return (
    <div
      className={`hud-indicator hud-battery ${isCritical ? 'hud-battery--critical' : ''}`}
      title={`Battery: ${voltageV.toFixed(1)}V · ${currentA !== null ? `${currentA.toFixed(1)}A` : 'no current'} · ${pct}%`}
    >
      <span className="hud-indicator-label">BAT</span>

      {/* Barra de porcentaje */}
      <div className="hud-battery-bar-track">
        <div
          className="hud-battery-bar-fill"
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            backgroundColor: color,
          }}
        />
      </div>

      {/* Datos numéricos */}
      <span className="hud-indicator-value" style={{ color }}>
        {remainingPercent !== null ? `${Math.round(pct)}%` : '--'}
      </span>
      <span className="hud-indicator-sub">
        {voltageV.toFixed(1)}V
        {currentA !== null ? ` · ${currentA.toFixed(1)}A` : ''}
      </span>
    </div>
  );
};
