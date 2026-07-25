import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useReplayImportStore } from '../store/replayImportStore';

const SERIES_COLORS = ['#40c8ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb7185'];

function buildRows(seriesIds: string[], dataset: NonNullable<ReturnType<typeof useReplayImportStore.getState>['dataset']>): Array<Record<string, number>> {
  const selected = dataset.plotSeries.filter((series) => seriesIds.includes(series.id));
  const rowsByTime = new Map<number, Record<string, number>>();

  for (const series of selected) {
    for (const point of series.points) {
      const row = rowsByTime.get(point.timestampMs) ?? { timestampMs: point.timestampMs };
      row[series.id] = point.value;
      rowsByTime.set(point.timestampMs, row);
    }
  }

  return Array.from(rowsByTime.values()).sort((a, b) => a.timestampMs - b.timestampMs);
}

function defaultSeriesIds(dataset: NonNullable<ReturnType<typeof useReplayImportStore.getState>['dataset']>): string[] {
  const preferred = dataset.plotSeries.filter((series) =>
    series.field === 'altitudeM' ||
    series.field === 'rollDeg' ||
    series.field === 'pitchDeg' ||
    series.field === 'yawDeg' ||
    series.field === 'groundspeedMs'
  );
  return preferred.slice(0, 4).map((series) => series.id);
}

export default function ReplayPlotPanel(): React.ReactElement | null {
  const dataset = useReplayImportStore((state) => state.dataset);
  const selectedIds = useReplayImportStore((state) => state.selectedPlotSeriesIds);
  const setSelectedPlotSeries = useReplayImportStore((state) => state.setSelectedPlotSeries);

  const effectiveIds = useMemo(() => {
    if (!dataset) return [];
    return selectedIds.length > 0 ? selectedIds : defaultSeriesIds(dataset);
  }, [dataset, selectedIds]);

  const rows = useMemo(() => {
    if (!dataset) return [];
    return buildRows(effectiveIds, dataset);
  }, [dataset, effectiveIds]);

  if (!dataset || dataset.plotSeries.length === 0) return null;

  return (
    <section className="mrv-plot">
      <div className="mrv-plot__header">
        <strong>Plots</strong>
        <span>{effectiveIds.length} señales</span>
      </div>
      <div className="mrv-plot__body">
        <div className="mrv-plot__fields">
          {dataset.plotSeries.slice(0, 80).map((series) => (
            <label key={series.id} className="mrv-plot__field">
              <input
                type="checkbox"
                checked={effectiveIds.includes(series.id)}
                onChange={(event) => {
                  const next = event.currentTarget.checked
                    ? [...effectiveIds, series.id]
                    : effectiveIds.filter((id) => id !== series.id);
                  setSelectedPlotSeries(next.slice(0, 6));
                }}
              />
              <span>{series.label}</span>
            </label>
          ))}
        </div>
        <div className="mrv-plot__chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="timestampMs" tick={{ fill: '#8ea0bd', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8ea0bd', fontSize: 11 }} />
              <Tooltip />
              {effectiveIds.map((id, index) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  dot={false}
                  stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
