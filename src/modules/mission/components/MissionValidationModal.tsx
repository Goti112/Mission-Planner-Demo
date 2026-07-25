/**
 * MissionValidationModal.tsx — Pre-flight Validation Results Dialog
 *
 * Displays errors and warnings produced by MissionValidator.validateMission().
 *
 * Behaviour:
 *   • Errors present     → "Corregir misión" dismiss button only (no confirm)
 *   • Warnings only      → "Confirmar de todas formas" lets the operator proceed
 *   • No issues          → This modal should not be rendered (caller's guard)
 */

import React from 'react';
import type { ValidationResult } from '..';
import './MissionValidationModal.css';

interface Props {
  result: ValidationResult;
  onConfirm: () => void;
  onCancel:  () => void;
}

const MissionValidationModal: React.FC<Props> = ({ result, onConfirm, onCancel }) => {
  const hasErrors   = result.errors.length   > 0;
  const hasWarnings = result.warnings.length > 0;

  const headerVariant = hasErrors ? 'error' : 'warning';
  const headerIcon    = hasErrors ? '✕' : '⚠';
  const headerTitle   = hasErrors
    ? 'No se puede iniciar la misión'
    : 'Advertencias de pre-vuelo';
  const headerSub = hasErrors
    ? 'Corrija los errores antes de proceder.'
    : 'Revise las advertencias y confirme para continuar.';

  return (
    <div className="mv-backdrop" role="dialog" aria-modal="true" aria-labelledby="mv-title">

      <div className="mv-modal">

        {/* ── Header ── */}
        <div className="mv-header">
          <div className={`mv-header__icon mv-header__icon--${headerVariant}`}>
            {headerIcon}
          </div>
          <div>
            <div className="mv-header__title" id="mv-title">{headerTitle}</div>
            <div className="mv-header__subtitle">{headerSub}</div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="mv-body">

          {/* Errors */}
          {hasErrors && (
            <div>
              <div className="mv-section__label mv-section__label--error">
                Errores ({result.errors.length})
              </div>
              <ul className="mv-issue-list">
                {result.errors.map((msg, i) => (
                  <li key={i} className="mv-issue mv-issue--error">
                    <span className="mv-issue__dot" />
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div>
              <div className="mv-section__label mv-section__label--warning">
                Advertencias ({result.warnings.length})
              </div>
              <ul className="mv-issue-list">
                {result.warnings.map((msg, i) => (
                  <li key={i} className="mv-issue mv-issue--warning">
                    <span className="mv-issue__dot" />
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="mv-footer">
          {hasErrors ? (
            <button className="mv-btn mv-btn--close" onClick={onCancel}>
              Corregir misión
            </button>
          ) : (
            <>
              <button className="mv-btn mv-btn--cancel" onClick={onCancel}>
                Cancelar
              </button>
              <button className="mv-btn mv-btn--confirm" onClick={onConfirm}>
                Confirmar de todas formas
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default MissionValidationModal;
