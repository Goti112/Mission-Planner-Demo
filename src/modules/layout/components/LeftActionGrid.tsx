import React from 'react';
import { Radio, CircleDot, LayoutGrid } from 'lucide-react';
import './LeftActionGrid.css';// ── Types ─────────────────────────────────────────────────────────────────

export type ActionButtonId =
  | 'Telem'
  | 'PreFlight'
  | 'Estado';

interface GridButton {
  id: ActionButtonId;
  label: string;
  /** Lucide icon component */
  icon: React.ReactNode;
  ariaLabel: string;
}

interface LeftActionGridProps {
  activeButton: ActionButtonId;
  onActivate: (id: ActionButtonId) => void;
}

// ── Button definitions ────────────────────────────────────────────────────

const GRID_BUTTONS: GridButton[] = [
  { id: 'Telem',     label: 'Telemetría',  icon: <Radio size={15} />,      ariaLabel: 'Ver telemetría del dron' },
  { id: 'PreFlight', label: 'Pre-Vuelo',  icon: <CircleDot size={15} />,  ariaLabel: 'Comprobaciones previas' },
  { id: 'Estado',    label: 'Estado',     icon: <LayoutGrid size={15} />, ariaLabel: 'Estado del sistema'     },
];

// ── Component ─────────────────────────────────────────────────────────────

const LeftActionGrid: React.FC<LeftActionGridProps> = ({ activeButton, onActivate }) => {
  return (
    <nav className="lag-container" aria-label="Panel navigation">
      <div className="lag-grid">
        {GRID_BUTTONS.map((btn) => {
          const isActive = btn.id === activeButton;
          return (
            <button
              key={btn.id}
              className={`lag-btn${isActive ? ' lag-btn--active' : ''}`}
              aria-label={btn.ariaLabel}
              aria-pressed={isActive}
              type="button"
              onClick={() => onActivate(btn.id)}
            >
              <span className="lag-btn-symbol" aria-hidden="true">
                {btn.icon}
              </span>
              <span className="lag-btn-label">{btn.label}</span>
            </button>
          );
        })}

      </div>
    </nav>
  );
};

export default LeftActionGrid;
