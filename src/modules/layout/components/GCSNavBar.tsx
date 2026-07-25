import React, { useCallback } from 'react';
import { Activity, Map, Play } from 'lucide-react';
import { useUIStore } from '../../../shared/store/uiStore';
import type { AppView } from '../../../shared/store/uiStore';
import { MAX_FRAMES_PER_DRONE, useFlightRecorderStore } from '../../replay';
import type { OperationalReadiness } from '../../operational';
import { PUBLIC_ASSET_URLS } from '../../../shared/utils/publicAssetUrl';
import { DroneFleetPanel } from './DroneFleetPanel';
import { LanguageSelector } from './LanguageSelector';
import './GCSNavBar.css';

interface GCSNavBarProps {
  clockTime: string;
  readiness: OperationalReadiness;
}

function getReadinessTone(readiness: OperationalReadiness): 'ready' | 'warning' | 'critical' | 'info' {
  if (readiness.blockers.some((message) => message.severity === 'critical')) return 'critical';
  if (readiness.blockers.length > 0 || readiness.warnings.length > 0) return 'warning';
  if (readiness.readyForFlight) return 'ready';
  return 'info';
}

function ReadinessPill({ readiness }: { readiness: OperationalReadiness }) {
  const tone = getReadinessTone(readiness);
  const alertCount = readiness.blockers.length + readiness.warnings.length;
  const details = [...readiness.blockers, ...readiness.warnings]
    .slice(0, 3)
    .map((message) => `${message.label}: ${message.detail}`);
  const title = [readiness.summary, ...details].join('\n');

  return (
    <div
      className={`gcs-navbar-readiness gcs-navbar-readiness--${tone}`}
      aria-label={`Estado operacional: ${readiness.summary}`}
      title={title}
    >
      <span className="gcs-navbar-readiness-dot" aria-hidden="true" />
      <span className="gcs-navbar-readiness-text">{readiness.summary}</span>
      {alertCount > 0 && (
        <span className="gcs-navbar-readiness-count" aria-hidden="true">
          {alertCount}
        </span>
      )}
    </div>
  );
}

interface NavViewButtonProps {
  view: AppView;
  label: string;
  icon: React.ReactNode;
}

function NavViewButton({ view, label, icon }: NavViewButtonProps) {
  const currentView = useUIStore((state) => state.currentView);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const isActive = currentView === view;

  return (
    <button
      className={`nav-view-btn ${isActive ? 'nav-view-btn--active' : ''}`}
      onClick={() => setCurrentView(view)}
      aria-pressed={isActive}
    >
      {icon}
      <span>{label}</span>
      {isActive && <span className="nav-view-indicator" />}
    </button>
  );
}

function ReplayButton() {
  const recordings = useFlightRecorderStore((state) => state.recordings);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const hasReplayData = Object.values(recordings).some(
    (recording) => Math.min(recording.total, MAX_FRAMES_PER_DRONE) >= 2,
  );
  const openReplay = useCallback((): void => {
    setCurrentView('REPLAY');
  }, [setCurrentView]);

  return (
    <button
      className={`nav-log-btn nav-log-btn--replay ${hasReplayData ? 'nav-log-btn--has-data' : ''}`}
      onClick={openReplay}
      disabled={!hasReplayData}
      title="Open simulation replay"
      type="button"
    >
      <Play size={13} />
      <span>Replay</span>
    </button>
  );
}

export const GCSNavBar: React.FC<GCSNavBarProps> = ({ clockTime, readiness }) => (
  <header className="gcs-navbar">
    <div className="gcs-navbar-brand">
      <div className="gcs-navbar-logo">
        <img src={PUBLIC_ASSET_URLS.logo} alt="Rohu" />
      </div>
    </div>

    <nav className="gcs-navbar-views" aria-label="Vistas">
      <NavViewButton view="FLIGHT" label="Vuelo" icon={<Activity size={14} />} />
      <NavViewButton view="PLAN" label="Plan" icon={<Map size={14} />} />
      <DroneFleetPanel />
    </nav>

    <span className="gcs-navbar-sep" aria-hidden="true" />
    <div className="nav-log-buttons">
      <ReplayButton />
    </div>
    <span className="gcs-navbar-sep" aria-hidden="true" />

    <div className="gcs-navbar-right">
      <ReadinessPill readiness={readiness} />
      <div className="gcs-navbar-divider" />
      <LanguageSelector />
      <div className="gcs-navbar-divider" />
      <span className="gcs-navbar-clock">{clockTime}</span>
    </div>
  </header>
);

export default GCSNavBar;
