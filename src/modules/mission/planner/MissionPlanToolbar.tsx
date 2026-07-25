import { FilePlus2, Play, Radio, Route, Timer } from 'lucide-react';
import { useDemoGuideStore } from '../../../demo/guide/demoGuideStore';
import type { DomainMissionMetrics, MissionValidationResult } from '../domain';
import type { MissionExecutionReadiness } from './missionPlanAdapter';
import type { PlannerMissionRecord } from './types';
import { formatMissionDistance, formatMissionDuration } from './missionPlanPresentation';

export interface MissionPlanToolbarProps {
  readonly mission: PlannerMissionRecord | null;
  readonly droneOptions: readonly { readonly id: string; readonly name: string }[];
  readonly selectedDroneId: string | null;
  readonly metrics: DomainMissionMetrics | null;
  readonly validation: MissionValidationResult | null;
  readonly readiness: MissionExecutionReadiness | null;
  readonly onSelectDrone: (droneId: string | null) => void;
  readonly onCreateMission: () => void;
  readonly onRenameMission: (name: string) => void;
  readonly onUploadStart: () => void;
}

const countText = (value: number, label: string): string => `${value} ${label}`;

export default function MissionPlanToolbar({
  mission,
  droneOptions,
  selectedDroneId,
  metrics,
  validation,
  readiness,
  onSelectDrone,
  onCreateMission,
  onRenameMission,
  onUploadStart,
}: MissionPlanToolbarProps) {
  const hasMission = mission !== null;
  const hasDrone = selectedDroneId !== null;
  const validationErrorCount = validation === null ? 0 : validation.errors.length;
  const validationWarningCount = validation === null ? 0 : validation.warnings.length;
  const canStart = hasMission && readiness !== null && readiness.canExecute;
  const guideStep = useDemoGuideStore((state) => state.step);
  const advanceGuide = useDemoGuideStore((state) => state.advance);

  const handleStartSimulation = (): void => {
    onUploadStart();

    if (guideStep === 'PLAN') {
      advanceGuide();
    }
  };

  return (
    <div className="mp-toolbar" role="toolbar" aria-label="Mission planning toolbar">
      <div className="mp-toolbar__cluster mp-toolbar__cluster--identity">
        <label className="mp-field mp-field--select">
          <span className="mp-field__icon">
            <Radio size={14} />
          </span>
          <select
            value={selectedDroneId ?? ''}
            onChange={(event) => onSelectDrone(event.target.value === '' ? null : event.target.value)}
            className="mp-input mp-input--select"
            aria-label="Select drone"
          >
            <option value="">No drone</option>
            {droneOptions.map((drone) => (
              <option key={drone.id} value={drone.id}>
                {drone.name}
              </option>
            ))}
          </select>
        </label>

        <input
          value={mission?.name ?? ''}
          onChange={(event) => onRenameMission(event.target.value)}
          className="mp-input mp-input--mission"
          placeholder="Mission name"
          disabled={!hasMission}
          aria-label="Mission name"
        />
      </div>

      <div className="mp-toolbar__cluster mp-toolbar__cluster--actions">
        <button
          type="button"
          className="mp-button"
          onClick={onCreateMission}
          disabled={!hasDrone}
          title="New mission"
        >
          <FilePlus2 size={14} />
          <span>New</span>
        </button>
        <button
          type="button"
          className="mp-button mp-button--primary"
          onClick={handleStartSimulation}
          disabled={!canStart}
          title="Start simulated mission"
          data-demo-target="start-simulation"
        >
          <Play size={14} />
          <span>Start simulated mission</span>
        </button>
      </div>

      <div className="mp-toolbar__cluster mp-toolbar__cluster--metrics" aria-label="Mission metrics">
        <span className="mp-chip">
          <Route size={13} />
          {metrics === null ? '0 m' : formatMissionDistance(metrics.totalDistanceM)}
        </span>
        <span className="mp-chip">
          <Timer size={13} />
          {metrics === null ? '0s' : formatMissionDuration(metrics.durationSeconds)}
        </span>
        <span className="mp-chip">{metrics === null ? countText(0, 'cmd') : countText(metrics.commandCount, 'cmd')}</span>
        <span className="mp-chip mp-chip--mode mp-chip--sim">SIM</span>
        <span className={`mp-chip ${validationErrorCount > 0 ? 'mp-chip--error' : 'mp-chip--quiet'}`}>
          E {validationErrorCount}
        </span>
        <span className={`mp-chip ${validationWarningCount > 0 ? 'mp-chip--warning' : 'mp-chip--quiet'}`}>
          W {validationWarningCount}
        </span>
      </div>
    </div>
  );
}
