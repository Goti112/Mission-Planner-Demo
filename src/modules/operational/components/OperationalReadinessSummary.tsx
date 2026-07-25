import React from 'react';
import type {
  OperationalMessage,
  OperationalReadiness,
} from '../core/OperationalReadiness';
import './OperationalReadinessSummary.css';

interface OperationalReadinessSummaryProps {
  readiness: OperationalReadiness;
  compact?: boolean;
  maxMessages?: number;
}

function statusClass(readiness: OperationalReadiness): string {
  if (readiness.blockers.some((m) => m.severity === 'critical')) return 'critical';
  if (readiness.blockers.length > 0) return 'warning';
  if (readiness.warnings.length > 0) return 'warning';
  if (readiness.readyForFlight) return 'ready';
  return 'info';
}

function renderMessage(msg: OperationalMessage) {
  return (
    <li key={`${msg.id}-${msg.detail}`} className={`ors-message ors-message--${msg.severity}`}>
      <span className="ors-message-label">{msg.label}</span>
      <span className="ors-message-detail">{msg.detail}</span>
    </li>
  );
}

const OperationalReadinessSummary: React.FC<OperationalReadinessSummaryProps> = ({
  readiness,
  compact = false,
  maxMessages = compact ? 1 : 3,
}) => {
  const cls = statusClass(readiness);
  const messages = [...readiness.blockers, ...readiness.warnings].slice(0, maxMessages);

  return (
    <section
      className={`ors-card ors-card--${cls}${compact ? ' ors-card--compact' : ''}`}
      aria-label="Estado operacional"
    >
      <div className="ors-main">
        <span className="ors-led" aria-hidden="true" />
        <div className="ors-copy">
          <span className="ors-eyebrow">Flight Readiness</span>
          <strong className="ors-summary">{readiness.summary}</strong>
        </div>
      </div>

      {messages.length > 0 && (
        <ul className="ors-messages">
          {messages.map(renderMessage)}
        </ul>
      )}
    </section>
  );
};

export default OperationalReadinessSummary;

