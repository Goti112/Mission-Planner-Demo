import React from 'react';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { useReplayImportStore } from '../store/replayImportStore';

function formatNumber(value: number | null, digits: number, suffix: string): string {
  return value === null ? '--' : `${value.toFixed(digits)}${suffix}`;
}

export default function ReplayAnalysisPanel(): React.ReactElement | null {
  const dataset = useReplayImportStore((state) => state.dataset);
  const selectedVehicleId = useReplayImportStore((state) => state.selectedVehicleId);
  const error = useReplayImportStore((state) => state.error);

  if (error) {
    return (
      <aside className="mrv-analysis mrv-analysis--error">
        <AlertTriangle size={16} />
        <strong>Error de importación</strong>
        <p>{error}</p>
      </aside>
    );
  }

  if (!dataset || !selectedVehicleId) return null;

  const vehicle = dataset.vehicles[selectedVehicleId];
  if (!vehicle) return null;

  return (
    <aside className="mrv-analysis">
      <div className="mrv-analysis__title">
        <BarChart3 size={15} />
        Post-vuelo
      </div>
      <div className="mrv-analysis__grid">
        <span>Duración</span>
        <strong>{formatNumber(vehicle.summary.durationSec, 1, 's')}</strong>
        <span>Altitud</span>
        <strong>{formatNumber(vehicle.summary.minAltitudeM, 1, 'm')} / {formatNumber(vehicle.summary.maxAltitudeM, 1, 'm')}</strong>
        <span>Velocidad máx.</span>
        <strong>{formatNumber(vehicle.summary.maxGroundspeedMs, 1, 'm/s')}</strong>
        <span>Batería</span>
        <strong>{formatNumber(vehicle.summary.initialBatteryPercent, 0, '%')} → {formatNumber(vehicle.summary.finalBatteryPercent, 0, '%')}</strong>
        <span>Mensajes</span>
        <strong>{dataset.diagnostics.decodedFrames}</strong>
        <span>Corruptos</span>
        <strong>{dataset.diagnostics.corruptFrames}</strong>
      </div>
      {dataset.events.length > 0 && (
        <div className="mrv-analysis__events">
          <span className="mrv-analysis__section">Eventos</span>
          {dataset.events.slice(0, 6).map((event) => (
            <div key={event.id} className="mrv-analysis__event">
              <strong>{event.label}</strong>
              <span>{event.detail}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
