import type { ReplayDataset } from './logImportTypes';

export function buildReplayAnalysisJson(dataset: ReplayDataset): string {
  return JSON.stringify({
    source: dataset.source,
    diagnostics: dataset.diagnostics,
    vehicles: Object.values(dataset.vehicles).map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      sysId: vehicle.sysId,
      compIds: vehicle.compIds,
      messageCounts: vehicle.messageCounts,
      summary: vehicle.summary,
    })),
    events: dataset.events,
  }, null, 2);
}

export function downloadReplayAnalysisJson(dataset: ReplayDataset): void {
  const json = buildReplayAnalysisJson(dataset);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${dataset.source.fileName}.analysis.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
