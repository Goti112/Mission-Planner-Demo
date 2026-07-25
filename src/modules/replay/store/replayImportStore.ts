import { create } from 'zustand';
import type { ReplayDataset, ReplayImportProgress, ReplayImportStage } from '../import/logImportTypes';

export interface ReplayImportState {
  status: ReplayImportStage;
  progress: ReplayImportProgress | null;
  dataset: ReplayDataset | null;
  selectedVehicleId: string | null;
  selectedPlotSeriesIds: string[];
  error: string | null;
  setImportProgress: (progress: ReplayImportProgress) => void;
  setImportReady: (dataset: ReplayDataset) => void;
  setImportError: (error: string) => void;
  setSelectedVehicleId: (vehicleId: string | null) => void;
  setSelectedPlotSeries: (seriesIds: string[]) => void;
  resetImport: () => void;
}

export const useReplayImportStore = create<ReplayImportState>((set) => ({
  status: 'IDLE',
  progress: null,
  dataset: null,
  selectedVehicleId: null,
  selectedPlotSeriesIds: [],
  error: null,
  setImportProgress(progress) {
    set({ status: progress.stage, progress, error: null });
  },
  setImportReady(dataset) {
    const firstVehicleId = Object.keys(dataset.vehicles)[0] ?? null;
    set({
      status: 'READY',
      dataset,
      selectedVehicleId: firstVehicleId,
      error: null,
      progress: {
        stage: 'READY',
        loadedBytes: dataset.source.byteLength,
        totalBytes: dataset.source.byteLength,
        message: 'Log listo',
      },
    });
  },
  setImportError(error) {
    set({ status: 'ERROR', error });
  },
  setSelectedVehicleId(vehicleId) {
    set({ selectedVehicleId: vehicleId });
  },
  setSelectedPlotSeries(seriesIds) {
    set({ selectedPlotSeriesIds: seriesIds });
  },
  resetImport() {
    set({
      status: 'IDLE',
      progress: null,
      dataset: null,
      selectedVehicleId: null,
      selectedPlotSeriesIds: [],
      error: null,
    });
  },
}));
