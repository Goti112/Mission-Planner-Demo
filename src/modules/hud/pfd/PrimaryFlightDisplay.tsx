/**
 * PrimaryFlightDisplay.tsx
 *
 * ════════════════════════════════════════════════════════════════════════
 * REFACTORED PFD — Grid-based instrument layout
 * ════════════════════════════════════════════════════════════════════════
 *
 * Grid layout:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                     HEADING TAPE                        │  44px
 *   ├──────────┬─────┬──────────────────────────┬────────┬────┤
 *   │ AIRSPEED │ THR │                          │ALTITUDE│    │
 *   │   TAPE   │RAIL │   ARTIFICIAL HORIZON     │  TAPE  │VSI │  1fr
 *   │          │     │                          │        │    │
 *   └──────────┴─────┴──────────────────────────┴────────┴────┘
 *
 * Sub-components:
 *   HeadingTapeCell            → instruments/HeadingTape.ts (canvas)
 *   AirspeedTapeCell           → instruments/SpeedTape.ts   (canvas)
 *   ThrottleIndicatorCell      → instruments/ThrottleIndicator.ts (canvas)
 *   ArtificialHorizonCell      → instruments/ArtificialHorizon.ts (canvas)
 *   AltitudeTapeCell           → instruments/AltitudeTape.ts (canvas)
 *   VerticalSpeedIndicatorCell → instruments/VerticalSpeedIndicator.ts (canvas)
 */

import React, { useEffect, useMemo, useRef } from 'react';

import {
  ArmState,
  type FlightTelemetry,
} from '../../telemetry';

// ── Canvas instrument classes (unchanged .ts files) ───────────────────────
import { ArtificialHorizon as AHInstrument }      from '../instruments/ArtificialHorizon';
import { AltitudeTape as ATInstrument }            from '../instruments/AltitudeTape';
import { SpeedTape }                               from '../instruments/SpeedTape';
import { ThrottleIndicator as THRInstrument }      from '../instruments/ThrottleIndicator';
import { VerticalSpeedIndicator as VSIInstrument } from '../instruments/VerticalSpeedIndicator';
import { HeadingTape as HTInstrument }             from '../instruments/HeadingTape';

// ── HUD hooks & core (unchanged) ──────────────────────────────────────────

import { DEFAULT_HUD_THEME }   from '../core/HUDTheme';
import { useHUDLoop }          from '../hooks/useHUDLoop';
import type { InstrumentMap, SnapshotProvider } from '../hooks/useHUDLoop';
import { useHUDResize }        from '../hooks/useHUDResize';
import type { CanvasInstrumentPair } from '../hooks/useHUDResize';
import { getPFDModeDisplayKey } from '../core/flightModeDisplay';

// ── Modular cell components ────────────────────────────────────────────────
import AirspeedTapeCell            from './AirspeedTape';
import ThrottleIndicatorCell       from './ThrottleIndicator';
import ArtificialHorizonCell       from './ArtificialHorizon';
import AltitudeTapeCell            from './AltitudeTape';
import VerticalSpeedIndicatorCell  from './VerticalSpeedIndicator';
import HeadingTapeCell             from './HeadingTape';


// ── CSS ───────────────────────────────────────────────────────────────────
import '../styles/hud-tokens.css';
import './pfd-grid.css';

export interface PrimaryFlightDisplayProps {
  /** Normalized telemetry driving all canvas instruments. */
  telemetry: FlightTelemetry;
  /**
   * Optional zero-delay snapshot source (TelemetryManager.getSnapshot ref).
   * When provided, the rAF loop reads telemetry directly from the manager
   * instead of going through React state, eliminating one commit delay.
   */
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
  /**
   * When true, applies pfd-grid--viewport CSS modifier.
   * Removes aspect-ratio constraint and uses wider column proportions
   * so the PFD fills the FlightDisplayViewport stage completely.
   */
  viewportMode?: boolean;
}

// ── Flight-mode badge helpers ────────────────────────────────────────────
const MODE_ABBR: Record<string, string> = {
  STABILIZE: 'STAB', ALT_HOLD: 'ALTH', SMART_RTL: 'SRTL',
  OFFBOARD:  'OFFB', AUTOTUNE: 'ATUN',
};

const _EMERGENCY = new Set(['RTL', 'SMART_RTL', 'LAND', 'BRAKE']);
const _ASSISTED  = new Set(['ALT_HOLD', 'LOITER', 'POSHOLD', 'CIRCLE', 'HOLD', 'POSITION']);
const _AUTO      = new Set(['AUTO', 'GUIDED', 'MISSION', 'OFFBOARD', 'TAKEOFF', 'THROW']);

function modeBadgeColor(mode: string): string {
  if (_AUTO.has(mode))      return 'var(--hud-safe)';
  if (_ASSISTED.has(mode))  return 'var(--hud-accent)';
  if (_EMERGENCY.has(mode)) return 'var(--hud-critical)';
  return 'var(--hud-warning)';
}

// ── Component ─────────────────────────────────────────────────────────────

export const PrimaryFlightDisplay: React.FC<PrimaryFlightDisplayProps> = ({
  telemetry,
  snapshotProvider,
  viewportMode = false,
}) => {
  const displayMode = getPFDModeDisplayKey(
    telemetry.vehicleStatus.flightMode,
    telemetry.vehicleStatus.flightModeLabel,
  );
  const hasConfirmedArmTelemetry = telemetry.vehicleStatus.isConnected
    && telemetry.vehicleStatus.lastHeartbeatMs > 0;
  const isArmed = telemetry.vehicleStatus.armState === ArmState.ARMED;
  const armLabel = isArmed ? 'ARMED' : 'DISARMED';

  // ── 1. Telemetry ref — keeps React out of the hot rAF path ───────────
  const telemetryRef = useRef<FlightTelemetry>(telemetry);
  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  // ── 2. Canvas refs — one per instrument ──────────────────────────────
  const horizonCanvasRef  = useRef<HTMLCanvasElement>(null);
  const altitudeCanvasRef = useRef<HTMLCanvasElement>(null);
  const speedCanvasRef    = useRef<HTMLCanvasElement>(null);
  const throttleCanvasRef = useRef<HTMLCanvasElement>(null);
  const vsiCanvasRef      = useRef<HTMLCanvasElement>(null);
  const headingCanvasRef  = useRef<HTMLCanvasElement>(null);

  // ── 3. Instrument instances — created once at mount ───────────────────
  const instrumentsRef = useRef<InstrumentMap>({});

  useEffect(() => {
    const theme = DEFAULT_HUD_THEME;

    if (horizonCanvasRef.current) {
      const horizon = new AHInstrument(horizonCanvasRef.current, theme);
      // Rectangular bezel: horizon fills the full cell (no circular clip).
      // The cell background handles the panel colour contrast.
      horizon.setRectangularBezel(true);
      // Synthetic vision terrain is designed for circular-bezel ADI mode.
      // In glass-cockpit rectangular mode the terrain fills edge-to-edge and
      // creates brown band artifacts; the sky/ground gradient is the correct background.
      horizon.setSyntheticVision(false);
      instrumentsRef.current.horizon = horizon;
    }
    if (altitudeCanvasRef.current)
      instrumentsRef.current.altitude = new ATInstrument(altitudeCanvasRef.current, theme);
    if (speedCanvasRef.current)
      instrumentsRef.current.speed    = new SpeedTape(speedCanvasRef.current, theme);
    if (throttleCanvasRef.current)
      instrumentsRef.current.throttle = new THRInstrument(throttleCanvasRef.current, theme);
    if (vsiCanvasRef.current)
      instrumentsRef.current.vsi      = new VSIInstrument(vsiCanvasRef.current, theme);
    if (headingCanvasRef.current)
      instrumentsRef.current.heading  = new HTInstrument(headingCanvasRef.current, theme);

    return () => {
      Object.values(instrumentsRef.current).forEach(inst => inst?.destroy());
      instrumentsRef.current = {};
    };
  }, []);

  // ── 4. Snapshot source for the rAF loop ──────────────────────────────
  //
  // Priority:
  //   1. External snapshotProvider — reads TelemetryManager._snapshot directly,
  //      zero React-commit delay. Used when TelemetryManager ref is available.
  //   2. Local telemetryRef adapter — fallback with one React-commit delay.
  const localSnapshotRef = useRef<SnapshotProvider>({
    getSnapshot: (): Readonly<FlightTelemetry> => telemetryRef.current,
  });
  const activeSnapshotRef = (
    snapshotProvider ?? localSnapshotRef
  ) as React.RefObject<SnapshotProvider | null>;

  // ── 5. rAF draw loop ─────────────────────────────────────────────────
  useHUDLoop(activeSnapshotRef, instrumentsRef);

  // ── 6. Per-canvas DPI-aware resize ───────────────────────────────────
  //
  // Each canvas has its own grid cell and therefore its own dimensions.
  // useHUDResize observes each canvas individually and calls instrument.resize()
  // with that canvas's actual clientWidth × clientHeight.
  const resizePairs = useMemo<CanvasInstrumentPair[]>(() => [
    { canvas: horizonCanvasRef,  getInstrument: () => instrumentsRef.current.horizon  },
    { canvas: speedCanvasRef,    getInstrument: () => instrumentsRef.current.speed    },
    { canvas: throttleCanvasRef, getInstrument: () => instrumentsRef.current.throttle },
    { canvas: altitudeCanvasRef, getInstrument: () => instrumentsRef.current.altitude },
    { canvas: vsiCanvasRef,      getInstrument: () => instrumentsRef.current.vsi      },
    { canvas: headingCanvasRef,  getInstrument: () => instrumentsRef.current.heading  },
  ], []);

  useHUDResize(resizePairs);

  // ── Render ────────────────────────────────────────────────────────────
  //
  // CSS grid assigns each child to its named area via the .pfd-cell--*
  // class. The grid enforces strict boundaries — no overlapping.
  // 
  // RESPONSIVE BEHAVIOR:
  // - In docked mode: grid uses fixed columns (60px, 1fr, 60px, 54px) and aspect-ratio
  // - In floating/viewport mode: grid stretches to fill container (100% width/height)
  // - No fixed aspect ratio in viewport mode — PFD scales to ANY rectangle
  return (
    <div
      className={`pfd-grid${viewportMode ? ' pfd-grid--viewport' : ''}`}
      role="region"
      aria-label="Primary Flight Display"
    >

      {/* Row 1 — Heading tape (full width) ──────────────────────── */}
      <HeadingTapeCell canvasRef={headingCanvasRef} />

      {/* Row 2 — Main instruments (left → right) ────────────────────── */}
      <AirspeedTapeCell           canvasRef={speedCanvasRef}    />
      <ThrottleIndicatorCell      canvasRef={throttleCanvasRef} />
      <ArtificialHorizonCell      canvasRef={horizonCanvasRef}  />
      <AltitudeTapeCell           canvasRef={altitudeCanvasRef} />
      <VerticalSpeedIndicatorCell canvasRef={vsiCanvasRef}      />

      {/* Flight mode label — top-left corner overlay */}
      <div
        className="pfd-mode-overlay"
        style={{ color: modeBadgeColor(displayMode) }}
      >
        {MODE_ABBR[displayMode] ?? displayMode}
      </div>

      {hasConfirmedArmTelemetry && (
        <div
          className={`pfd-arm-overlay ${isArmed ? 'pfd-arm-overlay--armed' : 'pfd-arm-overlay--disarmed'}`}
          role="status"
          aria-live="polite"
          aria-label={`Arm state ${armLabel}`}
          title={isArmed ? 'Vehicle armed' : 'Vehicle disarmed'}
        >
          {armLabel}
        </div>
      )}

    </div>
  );
};

export default PrimaryFlightDisplay;
