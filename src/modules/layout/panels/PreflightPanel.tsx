/**
 * PreflightPanel.tsx
 *
 * Pre-flight checklist panel with:
 * 1) Automatic system checks from OperationalReadiness
 * 2) Manual operator checklist items
 */

import React, { useState } from 'react';
import type { NormalizedTelemetry } from '../../telemetry';
import { OperationalReadinessSummary } from '../../operational';
import type { OperationalReadiness } from '../../operational';
import './PreflightPanel.css';

interface PreflightPanelProps {
  telemetry: NormalizedTelemetry | null;
  readiness: OperationalReadiness;
}

interface AutoCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

function buildAutoChecks(readiness: OperationalReadiness): AutoCheck[] {
  return [
    {
      id: 'active-drone',
      label: 'Dron activo',
      ok: readiness.activeDroneId !== null,
      detail: readiness.activeDroneId ? readiness.activeDroneId : 'Selecciona un dron.',
    },
    {
      id: 'link',
      label: 'Link y telemetria',
      ok: readiness.linkState === 'ready',
      detail: readiness.summary,
    },
    {
      id: 'blockers',
      label: 'Pre-arm',
      ok: readiness.blockers.length === 0,
      detail: readiness.blockers[0]?.detail ?? 'Sin bloqueos activos.',
    },
    {
      id: 'gps-modes',
      label: 'Modos GPS',
      ok: readiness.commandGate.canAuto && readiness.commandGate.canRtl,
      detail: readiness.commandGate.reasons.AUTO ?? readiness.commandGate.reasons.RTL ?? 'AUTO y RTL disponibles.',
    },
  ];
}

const MANUAL_CHECKS = [
  'Helices firmes, sin danos y correctamente montadas',
  'Zona de despegue y aterrizaje despejada',
  'Carga util fijada y dentro de limites',
  'Altitud RTL de emergencia configurada',
  'Observador en posicion',
  'Bateria cargada y bloqueada',
  'Antena GPS orientada correctamente',
];

const PreflightPanel: React.FC<PreflightPanelProps> = ({ readiness }) => {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const autoChecks = buildAutoChecks(readiness);

  const toggleCheck = (item: string) =>
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });

  const allDone = checkedItems.size === MANUAL_CHECKS.length;

  return (
    <div className="pf-panel" role="region" aria-label="Pre-flight checklist">
      <OperationalReadinessSummary readiness={readiness} />

      <div className="pf-section-title">
        System Checks
        <span className="pf-check-counter">
          {autoChecks.filter((check) => check.ok).length}/{autoChecks.length}
        </span>
      </div>

      <div className="pf-auto-checks">
        {autoChecks.map((check) => (
          <div
            key={check.id}
            className={`pf-auto-check${check.ok ? ' pf-auto-check--ok' : ' pf-auto-check--blocked'}`}
          >
            <span className="pf-auto-dot" aria-hidden="true" />
            <div className="pf-auto-copy">
              <span className="pf-auto-label">{check.label}</span>
              <span className="pf-auto-detail">{check.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pf-section-title">
        Manual Checks
        <span className="pf-check-counter">
          {checkedItems.size}/{MANUAL_CHECKS.length}
        </span>
      </div>

      <div className="pf-checklist">
        {MANUAL_CHECKS.map(item => {
          const checked = checkedItems.has(item);
          return (
            <button
              key={item}
              className={`pf-check-item${checked ? ' pf-check-item--done' : ''}`}
              onClick={() => toggleCheck(item)}
              role="checkbox"
              aria-checked={checked}
              type="button"
            >
              <span className={`pf-checkbox${checked ? ' pf-checkbox--checked' : ''}`} aria-hidden="true">
                {checked && (
                  <svg viewBox="0 0 16 16" fill="none">
                    <polyline
                      points="3,8 7,12 13,4"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="pf-check-label">{item}</span>
            </button>
          );
        })}
      </div>

      {allDone && (
        <div className="pf-complete-banner" role="status">
          <span className="pf-banner-dot" aria-hidden="true" />
          <span className="pf-banner-label">PRE-FLIGHT COMPLETE</span>
          <span className="pf-banner-icon" aria-hidden="true">OK</span>
        </div>
      )}
    </div>
  );
};

export default PreflightPanel;

