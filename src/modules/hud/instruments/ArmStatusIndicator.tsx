/**
 * ArmStatusIndicator.tsx
 *
 * Indicador de estado de armado del vehículo.
 *
 * DISARMED → texto gris, sin animación.
 * ARMED    → texto rojo pulsante (CSS animation).
 *            El parpadeo usa @keyframes CSS — no JS — para no impactar el rAF.
 */

import React from 'react';
import { ArmState } from '../../telemetry';

interface ArmStatusIndicatorProps {
  armState: ArmState;
}

export const ArmStatusIndicator: React.FC<ArmStatusIndicatorProps> = ({ armState }) => {
  const isArmed = armState === ArmState.ARMED;

  return (
    <div
      className={`hud-indicator hud-arm-status ${isArmed ? 'hud-arm-status--armed' : 'hud-arm-status--disarmed'}`}
      title={isArmed ? 'Vehicle ARMED — motors enabled' : 'Vehicle DISARMED'}
    >
      <span className="hud-indicator-label">ARM</span>
      <span className="hud-indicator-value">
        {isArmed ? 'ARMED' : 'DISARMED'}
      </span>
    </div>
  );
};
