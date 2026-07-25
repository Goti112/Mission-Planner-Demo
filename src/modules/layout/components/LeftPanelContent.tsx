import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ActionButtonId } from './LeftActionGrid';
import type { NormalizedTelemetry, FlightTelemetry } from '../../telemetry';
import type { OperationalReadiness } from '../../operational';
import { EASING_SPRING, TRANSITION_DURATION_FAST } from '../../../shared/config/constants';
import TelemetryPanelAdvanced from '../panels/TelemetryPanelAdvanced';
import '../panels/TelemetryPanelAdvanced.css';
import DroneHealthPanel from '../panels/DroneHealthPanel';
import '../panels/DroneHealthPanel.css';
import PreflightPanel from '../panels/PreflightPanel';
import '../panels/PreflightPanel.css';
import './LeftPanelContent.css';

interface LeftPanelContentProps {
  activeButton: ActionButtonId;
  normTelemetry: NormalizedTelemetry | null;
  simTelemetry: FlightTelemetry | null;
  droneName?: string;
  readiness: OperationalReadiness;
}

const PlaceholderPanel: React.FC<{ title: ActionButtonId }> = ({ title }) => (
  <div className="lpc-placeholder" role="status" aria-live="polite">
    <div className="lpc-placeholder-icon" aria-hidden="true"><LayoutGrid size={28} /></div>
    <span className="lpc-placeholder-title">{title}</span>
    <span className="lpc-placeholder-sub">Panel not yet implemented</span>
  </div>
);

const LeftPanelContent: React.FC<LeftPanelContentProps> = ({
  activeButton,
  normTelemetry,
  simTelemetry,
  droneName,
  readiness,
}) => {
  const isTelem = activeButton === 'Telem';

  const content = (() => {
    switch (activeButton) {
      case 'Telem':
        return (
          <div className="lpc-telem-body">
            <TelemetryPanelAdvanced
              telemetry={simTelemetry}
              normTelemetry={normTelemetry}
              droneName={droneName}
            />
          </div>
        );
      case 'Estado':
        return <DroneHealthPanel normTelemetry={normTelemetry} readiness={readiness} />;
      case 'PreFlight':
        return <PreflightPanel telemetry={normTelemetry} readiness={readiness} />;
      default:
        return <PlaceholderPanel title={activeButton} />;
    }
  })();

  return (
    <div className="lpc-container">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeButton}
          className={`lpc-panel-enter${isTelem ? ' lpc-panel-enter--telem' : ''}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: TRANSITION_DURATION_FAST, ease: EASING_SPRING as [number, number, number, number] }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default LeftPanelContent;
