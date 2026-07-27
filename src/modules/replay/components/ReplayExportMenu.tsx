import React, { useCallback } from 'react';
import { Download } from 'lucide-react';
import { downloadTlog } from '../../mission';
import { downloadRecordings } from '../../../utils/telemetryFileIO';
import { downloadReplayAnalysisJson } from '../import';
import { useFlightRecorderStore } from '../store/flightRecorderStore';
import { useReplayImportStore } from '../store/replayImportStore';

export default function ReplayExportMenu(): React.ReactElement {
  const recordings = useFlightRecorderStore((state) => state.recordings);
  const dataset = useReplayImportStore((state) => state.dataset);
  const hasRecordings = Object.keys(recordings).length > 0;

  const exportMissionTlog = useCallback(() => {
    if (!hasRecordings) return;
    downloadTlog(recordings, dataset?.source.fileName ?? 'replay');
  }, [dataset?.source.fileName, hasRecordings, recordings]);

  const exportMissionJson = useCallback(() => {
    if (!hasRecordings) return;
    downloadRecordings(recordings, dataset?.source.fileName ?? 'replay');
  }, [dataset?.source.fileName, hasRecordings, recordings]);

  const exportAnalysis = useCallback(() => {
    if (!dataset) return;
    downloadReplayAnalysisJson(dataset);
  }, [dataset]);

  return (
    <div className="mrv-export">
      <button type="button" className="mrv-export__button" disabled={!hasRecordings} onClick={exportMissionTlog}>
        <Download size={14} />
        Mission Planner TLOG
      </button>
      <button type="button" className="mrv-export__button" disabled={!hasRecordings} onClick={exportMissionJson}>
        JSON
      </button>
      <button type="button" className="mrv-export__button" disabled={!dataset} onClick={exportAnalysis}>
        Análisis
      </button>
    </div>
  );
}
