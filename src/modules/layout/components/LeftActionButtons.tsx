import React from 'react';
import { Route, Cpu, Package, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import './LeftActionButtons.css';

interface ActionButton {
  id: string;
  label: string;
  icon: React.ReactNode;
  ariaLabel: string;
}

const ACTION_BUTTONS: ActionButton[] = [
  {
    id: 'mission-planner',
    label: 'Mission Planner',
    icon: <Route size={13} />,
    ariaLabel: 'Open Mission Planner',
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    icon: <Cpu size={13} />,
    ariaLabel: 'Open Autopilot configuration',
  },
  {
    id: 'payload',
    label: 'Payload',
    icon: <Package size={13} />,
    ariaLabel: 'Open Payload controls',
  },
  {
    id: 'failsafe',
    label: 'Failsafe',
    icon: <ShieldAlert size={13} />,
    ariaLabel: 'Open Failsafe settings',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: <SlidersHorizontal size={13} />,
    ariaLabel: 'Open Advanced settings',
  },
];

const LeftActionButtons: React.FC = () => {
  return (
    <div className="left-action-section" role="navigation" aria-label="Drone configuration">
      <div className="left-action-header">
        <span className="left-action-section-label">CONFIGURATION</span>
      </div>
      <div className="left-action-list">
        {ACTION_BUTTONS.map((btn) => (
          <button
            key={btn.id}
            className="left-action-btn"
            aria-label={btn.ariaLabel}
            type="button"
          >
            <span className="left-action-btn-icon" aria-hidden="true">
              {btn.icon}
            </span>
            <span className="left-action-btn-label">{btn.label}</span>
            <span className="left-action-btn-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LeftActionButtons;
