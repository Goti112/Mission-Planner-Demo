/**
 * LeftColumn.tsx
 *
 * Orchestrates the left instrument sidebar:
 *   1. PFD           — Primary Flight Display canvas (grid layout)
 *   2. LeftActionGrid — compact 2-column panel selector
 *   3. LeftPanelContent — dynamic content driven by active button
 *
 * Holds only local UI state (active button).
 * Does NOT touch TelemetryManager or instrument math.
 */

import React, { useState } from 'react';
import { DraggablePFDPanel } from '../../hud';
import type { FlightTelemetry } from '../../telemetry';
import type { NormalizedTelemetry } from '../../telemetry';
import type { SnapshotProvider } from '../../hud';
import type { OperationalReadiness } from '../../operational';

import LeftActionGrid from './LeftActionGrid';
import type { ActionButtonId } from './LeftActionGrid';

import LeftPanelContent from './LeftPanelContent';

import './LeftColumn.css';

// ── Props ─────────────────────────────────────────────────────────────────

interface LeftColumnProps {
  /** Live telemetry driving HUD canvas instruments. */
  simTelemetry: FlightTelemetry;
  /** Normalized telemetry for the telemetry panel. */
  normTelemetry: NormalizedTelemetry | null;
  /** Display name of the active drone (shown as panel title). */
  droneName?: string;
  /**
   * Direct ref to TelemetryManager.getSnapshot() — zero-delay canvas rendering.
   * Passed straight through to DraggablePFDPanel rAF loop.
   */
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
  /** Shared operational readiness/gating model for panel UX. */
  readiness: OperationalReadiness;
}

// ── Component ─────────────────────────────────────────────────────────────

const LeftColumn: React.FC<LeftColumnProps> = ({
  simTelemetry,
  normTelemetry,
  droneName,
  snapshotProvider,
  readiness,
}) => {
  const [activeButton, setActiveButton] = useState<ActionButtonId>('Telem');

  return (
    <div className="left-col-inner">
      {/* ── 1. PFD: Primary Flight Display (draggable — grab the handle to move) ── */}
      <div className="left-col-pfd">
        <DraggablePFDPanel
          telemetry={simTelemetry}
          snapshotProvider={snapshotProvider}
        />
      </div>

      {/* ── 2. Compact panel-selector grid ───────────────────────────── */}
      <LeftActionGrid
        activeButton={activeButton}
        onActivate={setActiveButton}
      />

      {/* ── 3. Dynamic content area ──────────────────────────────────── */}
      <LeftPanelContent
        activeButton={activeButton}
        normTelemetry={normTelemetry}
        simTelemetry={simTelemetry}
        droneName={droneName}
        readiness={readiness}
      />
    </div>
  );
};

export default React.memo(LeftColumn);
