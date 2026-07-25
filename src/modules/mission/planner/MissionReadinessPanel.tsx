import { AlertTriangle, CheckCircle2, CircleSlash } from 'lucide-react';
import type { MissionValidationResult } from '../domain';
import type { MissionExecutionReadiness, MissionPlanExecutionIssue } from './missionPlanAdapter';

export interface MissionReadinessPanelProps {
  readonly readiness: MissionExecutionReadiness | null;
  readonly validation: MissionValidationResult | null;
}

interface ReadinessBadge {
  readonly tone: 'error' | 'warning';
  readonly message: string;
}

const validationIssueKeys = (validation: MissionValidationResult): ReadonlySet<string> =>
  new Set([
    ...validation.errors.map((issue) => `${issue.itemId ?? 'plan'}:${issue.seq ?? 'plan'}:${issue.message}`),
    ...validation.warnings.map((issue) => `${issue.itemId ?? 'plan'}:${issue.seq ?? 'plan'}:${issue.message}`),
  ]);

const filterExecutionIssues = (
  issues: readonly MissionPlanExecutionIssue[],
  validation: MissionValidationResult | null,
): readonly MissionPlanExecutionIssue[] => {
  if (validation === null) {
    return issues;
  }

  const keys = validationIssueKeys(validation);

  return issues.filter((issue) => !keys.has(`${issue.itemId ?? 'plan'}:${issue.seq ?? 'plan'}:${issue.message}`));
};

const collectIssueBadges = (
  readiness: MissionExecutionReadiness | null,
  validation: MissionValidationResult | null,
): readonly ReadinessBadge[] => {
  const validationErrors =
    validation === null ? [] : validation.errors.map((issue): ReadinessBadge => ({ tone: 'error', message: issue.message }));
  const readinessBlockers =
    readiness === null
      ? []
      : filterExecutionIssues(readiness.blockers, validation).map((issue): ReadinessBadge => ({
          tone: 'error',
          message: issue.message,
        }));
  const validationWarnings =
    validation === null ? [] : validation.warnings.map((issue): ReadinessBadge => ({ tone: 'warning', message: issue.message }));
  const readinessWarnings =
    readiness === null
      ? []
      : filterExecutionIssues(readiness.warnings, validation).map((issue): ReadinessBadge => ({
          tone: 'warning',
          message: issue.message,
        }));

  return [...validationErrors, ...readinessBlockers, ...validationWarnings, ...readinessWarnings].slice(0, 4);
};

export default function MissionReadinessPanel({
  readiness,
  validation,
}: MissionReadinessPanelProps) {
  const issues = collectIssueBadges(readiness, validation);
  const canExecute = readiness !== null && readiness.canExecute;
  const mode = readiness?.mode ?? 'SIM';
  const validationErrorCount = validation?.errors.length ?? 0;
  const validationWarningCount = validation?.warnings.length ?? 0;
  const blockerCount = readiness === null ? 0 : filterExecutionIssues(readiness.blockers, validation).length;
  const warningCount = readiness === null ? 0 : filterExecutionIssues(readiness.warnings, validation).length;

  return (
    <section className="mp-readiness" aria-label="Mission readiness">
      <div className="mp-readiness__summary">
        <span className={`mp-readiness__state ${canExecute ? 'mp-readiness__state--ready' : 'mp-readiness__state--blocked'}`}>
          {canExecute ? <CheckCircle2 size={14} /> : <CircleSlash size={14} />}
          {canExecute ? 'Ready' : 'Blocked'}
        </span>
        <span className="mp-chip mp-chip--mode">{mode}</span>
        <span className="mp-chip">{readiness === null ? '0 sim' : `${readiness.simulatedCount} sim`}</span>
        <span className="mp-chip mp-chip--error">B {blockerCount + validationErrorCount}</span>
        <span className="mp-chip mp-chip--warning">W {warningCount + validationWarningCount}</span>
      </div>

      <div className="mp-readiness__issues">
        {issues.length === 0 ? (
          <span className="mp-readiness__clean">No issues</span>
        ) : (
          issues.map((issue, index) => (
            <span key={`${issue.tone}-${index}-${issue.message}`} className={`mp-badge mp-badge--${issue.tone}`}>
              <AlertTriangle size={12} />
              {issue.message}
            </span>
          ))
        )}
      </div>
    </section>
  );
}
