import React from 'react';
import {
  Radio,
  Activity,
  Mountain,
  Satellite,
} from 'lucide-react';

import type { Drone } from '../../drone';
import type { GPSStatusTelemetry } from '../../telemetry';
import {
  MissionState,
  MISSION_STATE_LABELS,
  MISSION_STATE_COLORS,
} from '../../mission';
import { getBatteryColor } from '../../telemetry';
import { BatteryIcon } from '../../../components/shared/BatteryIcon';
import './DroneStatusPills.css';

interface DroneStatusPillsProps {
  drone: Drone | null;
  gpsStatus: GPSStatusTelemetry | null;
}

function formatSatelliteCount(gpsStatus: GPSStatusTelemetry | null): string {
  if (gpsStatus === null) return '--';
  return gpsStatus.satellitesVisible.toString();
}

function formatHdop(gpsStatus: GPSStatusTelemetry | null): string {
  if (gpsStatus === null || gpsStatus.hdop === null) return '--';
  return gpsStatus.hdop.toFixed(1);
}

export const DroneStatusPills: React.FC<DroneStatusPillsProps> = React.memo(({ drone, gpsStatus }) => {
  if (!drone) return null;

  const batt = drone.battery;
  const battColor = getBatteryColor(batt);
  const satelliteCountLabel = formatSatelliteCount(gpsStatus);
  const hdopLabel = formatHdop(gpsStatus);

  const lifecycleState = drone.missionLifecycleState ?? MissionState.IDLE;
  const lifecycleLabel = MISSION_STATE_LABELS[lifecycleState];
  const lifecycleColor = MISSION_STATE_COLORS[lifecycleState];

  return (
    <div className="drone-status-pills">
      <div className="dsp-pill" style={{ color: battColor }} title="Batería">
        <BatteryIcon pct={batt} size={12} />
        <span>{batt}%</span>
      </div>
      <div className="dsp-pill dsp-pill--mode" title="Modo de vuelo">
        <Radio size={11} />
        <span>{drone.mode}</span>
      </div>
      <div className="dsp-pill dsp-pill--altitude" title="Altitud AGL">
        <Mountain size={11} />
        <span style={{ fontWeight: 800 }}>ALTITUD:</span>
        <span style={{ fontWeight: 800 }}>{drone.altitude.toFixed(1)}m</span>
      </div>
      <div className="dsp-pill dsp-pill--gps" title="Satélites GPS visibles">
        <Satellite size={11} />
        <span>SAT</span>
        <span>{satelliteCountLabel}</span>
      </div>
      <div className="dsp-pill dsp-pill--gps" title="Horizontal Dilution of Precision">
        <span>HDOP</span>
        <span>{hdopLabel}</span>
      </div>
      {lifecycleState !== MissionState.IDLE && (
        <div
          className="dsp-pill dsp-pill--mission"
          style={{ color: lifecycleColor }}
          title="Estado de misión"
        >
          <Activity size={11} />
          <span>{lifecycleLabel}</span>
        </div>
      )}
    </div>
  );
});

export default DroneStatusPills;
