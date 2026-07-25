/**
 * BatteryIcon.tsx
 *
 * Shared presentational component that renders the correct Lucide battery
 * icon (Full / Medium / Low / Warning) based on a percentage value.
 *
 * Used by: DroneStatusPills, DroneFleetPanel, TelemetryDroneSelector.
 */

import React from 'react';
import { BatteryFull, BatteryMedium, BatteryLow, BatteryWarning } from 'lucide-react';
import { getBatteryColor, getBatteryLevel } from '../../modules/telemetry';

interface BatteryIconProps {
  /** Battery percentage 0–100. */
  pct: number;
  /** Icon size in pixels (default 12). */
  size?: number;
  /** If true, renders BatteryWarning below 10 % instead of BatteryLow. */
  showWarning?: boolean;
}

export const BatteryIcon: React.FC<BatteryIconProps> = ({ pct, size = 12, showWarning = false }) => {
  const level = getBatteryLevel(pct);
  const color = getBatteryColor(pct);

  if (level === 'high')   return <BatteryFull   size={size} style={{ color }} />;
  if (level === 'medium') return <BatteryMedium size={size} style={{ color }} />;
  if (showWarning && pct <= 10) return <BatteryWarning size={size} style={{ color }} />;
  return <BatteryLow size={size} style={{ color }} />;
};

export default BatteryIcon;
