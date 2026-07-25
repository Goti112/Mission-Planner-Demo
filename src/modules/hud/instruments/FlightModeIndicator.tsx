/**
 * FlightModeIndicator.tsx
 *
 * Indicador de modo de vuelo.
 * Componente React HTML/CSS. Se actualiza raramente (cambio de modo).
 *
 * Codificación por color:
 *   MANUAL / STABILIZE / ACRO → naranja (operador en control)
 *   ALT_HOLD / LOITER / POSHOLD / CIRCLE → azul (asistido)
 *   AUTO / GUIDED / MISSION → verde (autónomo)
 *   RTL / SMART_RTL / LAND / BRAKE → rojo (emergencia/retorno)
 *   UNKNOWN → gris
 */

import React from 'react';
import { FlightMode } from '../../telemetry';
import { getPFDModeDisplayLabel, getPFDModeDisplayKey } from '../core/flightModeDisplay';

interface FlightModeIndicatorProps {
  mode:  FlightMode;
  label: string;
}

type ModeCategory = 'manual' | 'assisted' | 'autonomous' | 'emergency' | 'unknown';

const MANUAL_MODES     = new Set<FlightMode>([FlightMode.MANUAL, FlightMode.STABILIZE, FlightMode.ACRO, FlightMode.SPORT, FlightMode.AUTOTUNE]);
const ASSISTED_MODES   = new Set<FlightMode>([FlightMode.ALT_HOLD, FlightMode.LOITER, FlightMode.POSHOLD, FlightMode.CIRCLE, FlightMode.HOLD, FlightMode.POSITION]);
const AUTONOMOUS_MODES = new Set<FlightMode>([FlightMode.AUTO, FlightMode.GUIDED, FlightMode.MISSION, FlightMode.OFFBOARD, FlightMode.TAKEOFF, FlightMode.THROW]);
const EMERGENCY_MODES  = new Set<FlightMode>([FlightMode.RTL, FlightMode.SMART_RTL, FlightMode.LAND, FlightMode.BRAKE]);

function getModeCategory(mode: FlightMode): ModeCategory {
  if (MANUAL_MODES.has(mode))     return 'manual';
  if (ASSISTED_MODES.has(mode))   return 'assisted';
  if (AUTONOMOUS_MODES.has(mode)) return 'autonomous';
  if (EMERGENCY_MODES.has(mode))  return 'emergency';
  return 'unknown';
}

const CATEGORY_COLORS: Record<ModeCategory, string> = {
  manual:     'var(--hud-warning)',
  assisted:   'var(--hud-accent)',
  autonomous: 'var(--hud-safe)',
  emergency:  'var(--hud-critical)',
  unknown:    'var(--hud-text-dim)',
};

export const FlightModeIndicator: React.FC<FlightModeIndicatorProps> = ({ mode, label }) => {
  const displayMode = getPFDModeDisplayKey(mode, label) as FlightMode;
  const displayLabel = getPFDModeDisplayLabel(mode, label);
  const category = getModeCategory(displayMode);
  const color     = CATEGORY_COLORS[category];

  return (
    <div
      className="hud-indicator hud-flight-mode"
      style={{ borderColor: color }}
      title={`Flight Mode: ${displayLabel}`}
    >
      <span className="hud-indicator-label">MODE</span>
      <span
        className="hud-indicator-value"
        style={{ color }}
      >
        {displayLabel}
      </span>
    </div>
  );
};
