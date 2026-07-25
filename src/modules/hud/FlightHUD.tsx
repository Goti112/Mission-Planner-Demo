/**
 * FlightHUD.tsx
 *
 * Shell principal del HUD de vuelo.
 *
 * Responsabilidades:
 *   1. Recibir FlightTelemetry como prop (inmutable, no mutable aquí).
 *   2. Mantener la telemetría en un useRef para el rAF loop (sin re-render).
 *   3. Instanciar los instrumentos canvas al mount, destruirlos al unmount.
 *   4. Delegar el loop de animación a useHUDLoop.
 *   5. Delegar el resize DPI-aware a useHUDResize.
 *   6. Renderizar los indicadores HTML/CSS pasándoles solo los campos que necesitan.
 *
 * Patrón de estado:
 *   - telemetryRef → datos continuos a 50Hz → rAF loop → canvas.draw()
 *   - React state  → datos discretos (armState, flightMode, GPS, battery) → indicadores HTML
 *
 * El HUD NO conoce MAVLink, SITL, ni ningún protocolo.
 * Recibe solo FlightTelemetry normalizado.
 */

import React, { useEffect, useMemo, useRef } from 'react';

import type { FlightTelemetry, FlightDerivedData, Waypoint } from '../telemetry';
import { DEFAULT_FLIGHT_DERIVED_DATA } from '../telemetry';

import { ArtificialHorizon }       from './instruments/ArtificialHorizon';
import { AltitudeTape }            from './instruments/AltitudeTape';
import { SpeedTape }                from './instruments/SpeedTape';
import { HeadingTape }             from './instruments/HeadingTape';
import { VerticalSpeedIndicator }  from './instruments/VerticalSpeedIndicator';
import { WaypointDirector }        from './instruments/WaypointDirector';
import type { NavContext }          from './instruments/WaypointDirector';
import { ThrottleIndicator }       from './instruments/ThrottleIndicator';

import { computeDerivedData }      from './core/DerivedDataEngine';
import type { DerivedPosition } from './core/DerivedDataEngine';
import { DEFAULT_HUD_THEME }       from './core/HUDTheme';
import { useHUDLoop } from './hooks/useHUDLoop';
import type { InstrumentMap, SnapshotProvider } from './hooks/useHUDLoop';
import { useHUDResize } from './hooks/useHUDResize';
import type { CanvasInstrumentPair } from './hooks/useHUDResize';
import { HUDDebugOverlay } from './debug/HUDDebugOverlay';

import './styles/hud-tokens.css';
import './styles/hud-layout.css';
import './styles/hud-components.css';

// ── Props ─────────────────────────────────────────────────────────────────

const readDerivedPositionFromTelemetry = (telemetry: FlightTelemetry): DerivedPosition | null => {
  const { latitude, longitude } = telemetry.navigation;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  return { latitude, longitude };
};

interface FlightHUDProps {
  /** Telemetría normalizada. Actualizar a la frecuencia del autopiloto (≤50 Hz). */
  telemetry:      FlightTelemetry;
  /** Waypoint activo de la misión. Null si no hay misión activa. */
  activeWaypoint: Waypoint | null;
  /** Posición del home registrada al arm. */
  homePosition:   { latitude: number; longitude: number; altitudeMSLm: number } | null;
  /** Capacidad total de la batería en mAh (para calcular tiempo restante). */
  batteryCapacityMah?: number;
  /**
   * Optional direct link to TelemetryManager.getSnapshot().
   *
   * When provided the canvas rAF loop reads from this ref instead of the
   * local telemetryRef adapter.  This eliminates the React-state commit
   * delay from the hot canvas path:
   *
   *   WITHOUT snapshotProvider (legacy):
   *     onTelemetry → setTelemetry → React re-render → useEffect →
   *     telemetryRef.current → snapshotRef.getSnapshot() → canvas.draw()
   *
   *   WITH snapshotProvider (zero-delay):
   *     TelemetryManager._snapshot (updated at source rate)
   *     → manager.getSnapshot() → canvas.draw()  ← no React involvement
   *
   * HTML overlays (battery, GPS, arm state) still read from `telemetry`
   * React state — perfectly fine at their update frequency.
   */
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
  /**
   * Mostrar overlay de diagnóstico (FPS, latencia, modo interpolador).
   * Por defecto deshabilitado. Activar en desarrollo con showDebugOverlay={true}.
   */
  showDebugOverlay?: boolean;
}

// ── Componente ────────────────────────────────────────────────────────────

export const FlightHUD: React.FC<FlightHUDProps> = ({
  telemetry,
  activeWaypoint,
  homePosition,
  batteryCapacityMah = 5000,
  snapshotProvider,
  showDebugOverlay = false,
}) => {
  // ── 1. Ref para el loop (no causa re-render al actualizar) ────────────
  // Still maintained as fallback when snapshotProvider is not provided.
  const telemetryRef = useRef<FlightTelemetry>(telemetry);
  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  // ── 2. Canvas refs ────────────────────────────────────────────────────
  const horizonCanvasRef  = useRef<HTMLCanvasElement>(null);
  const altitudeCanvasRef = useRef<HTMLCanvasElement>(null);
  const speedCanvasRef    = useRef<HTMLCanvasElement>(null);
  const headingCanvasRef  = useRef<HTMLCanvasElement>(null);
  const vsiCanvasRef      = useRef<HTMLCanvasElement>(null);
  const waypointCanvasRef = useRef<HTMLCanvasElement>(null);
  const throttleCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── 3. Instrumentos canvas (instanciados al mount) ────────────────
  const instrumentsRef = useRef<InstrumentMap>({});

  useEffect(() => {
    const theme = DEFAULT_HUD_THEME;

    if (horizonCanvasRef.current) {
      const horizon = new ArtificialHorizon(horizonCanvasRef.current, theme);
      // Rectangular mode: fills the full canvas — the circular bezel clip
      // is disabled so the sky/ground act as a background layer and the
      // speed/altitude tape overlays sit on top.
      horizon.setRectangularBezel(true);
      // Synthetic vision terrain is designed for circular-bezel ADI mode.
      // In glass-cockpit rectangular mode the terrain fills edge-to-edge and
      // creates brown band artifacts; the sky/ground gradient is the correct background.
      horizon.setSyntheticVision(false);
      instrumentsRef.current.horizon = horizon;
    }
    if (altitudeCanvasRef.current)
      instrumentsRef.current.altitude = new AltitudeTape(altitudeCanvasRef.current, theme);
    if (speedCanvasRef.current)
      instrumentsRef.current.speed    = new SpeedTape(speedCanvasRef.current,    theme);
    if (headingCanvasRef.current)
      instrumentsRef.current.heading  = new HeadingTape(headingCanvasRef.current,  theme);
    if (vsiCanvasRef.current)
      instrumentsRef.current.vsi      = new VerticalSpeedIndicator(vsiCanvasRef.current, theme);
    if (waypointCanvasRef.current)
      instrumentsRef.current.waypoint = new WaypointDirector(waypointCanvasRef.current, theme);
    if (throttleCanvasRef.current)
      instrumentsRef.current.throttle = new ThrottleIndicator(throttleCanvasRef.current, theme);

    return () => {
      // Destruir instrumentos al desmontar.
      Object.values(instrumentsRef.current).forEach(inst => inst?.destroy());
      instrumentsRef.current = {};
    };
  }, []);

  // ── 5. Snapshot source for the rAF loop ──────────────────────────────
  //
  // Priority:
  //   1. External snapshotProvider (TelemetryManager ref) — zero React delay.
  //      The rAF reads the manager's _snapshot directly, which is updated
  //      synchronously at the source rate (20 Hz sim / up to 100 Hz MAVLink).
  //   2. Local telemetryRef adapter — legacy fallback (1 React-commit delay).
  //
  // Both are stable refs — the selection never changes after mount,
  // so useHUDLoop's effect dependency (runs once) is not violated.
  const localSnapshotRef = useRef<SnapshotProvider>({
    getSnapshot: (): Readonly<FlightTelemetry> => telemetryRef.current,
  });
  // Coerce: when snapshotProvider is present it's always a valid SnapshotProvider ref.
  const activeSnapshotRef = (snapshotProvider ?? localSnapshotRef) as React.RefObject<SnapshotProvider | null>;

  // ── 6. rAF loop global ────────────────────────────────────────────────
  // activeSnapshotRef is passed: useHUDLoop calls getSnapshot() in the hot path.
  useHUDLoop(activeSnapshotRef, instrumentsRef);

  // ── 7. Resize DPI-aware — each canvas observed independently ────────
  //
  // Each canvas has its own CSS-driven size in the overlay layout.
  // useHUDResize observes each canvas element and calls instrument.resize()
  // with that canvas's actual rendered dimensions (not the container size).
  const resizePairs = useMemo<CanvasInstrumentPair[]>(() => [
    { canvas: horizonCanvasRef,  getInstrument: () => instrumentsRef.current.horizon  },
    { canvas: speedCanvasRef,    getInstrument: () => instrumentsRef.current.speed    },
    { canvas: altitudeCanvasRef, getInstrument: () => instrumentsRef.current.altitude },
    { canvas: headingCanvasRef,  getInstrument: () => instrumentsRef.current.heading  },
    { canvas: vsiCanvasRef,      getInstrument: () => instrumentsRef.current.vsi      },
    { canvas: waypointCanvasRef, getInstrument: () => instrumentsRef.current.waypoint },
    { canvas: throttleCanvasRef, getInstrument: () => instrumentsRef.current.throttle },
  ], []);

  useHUDResize(resizePairs);

  // ── 8. Datos derivados — calculados en effect, no en render ──────────
  const derivedDataRef = useRef<FlightDerivedData>(DEFAULT_FLIGHT_DERIVED_DATA);
  const previousDerivedTelemetryRef = useRef<FlightTelemetry | null>(null);

  useEffect(() => {
    const previousPosition = previousDerivedTelemetryRef.current === null
      ? null
      : readDerivedPositionFromTelemetry(previousDerivedTelemetryRef.current);
    const derived = computeDerivedData(telemetry, {
      homePosition,
      activeWaypoint,
      batteryCapacityMah,
      previousPosition,
      prev: derivedDataRef.current,
    });
    derivedDataRef.current = derived;
    previousDerivedTelemetryRef.current = telemetry;

    // Push home and waypoint bearing/distance to WaypointDirector.
    // These values are not in FlightTelemetry (they require external home position
    // or the active mission waypoint), so they are injected via a side-channel
    // setter — safe because both React effects and the rAF loop run on the same
    // JS main thread.
    const wd = instrumentsRef.current.waypoint;
    if (wd instanceof WaypointDirector) {
      const ctx: NavContext = {
        homeBearingDeg: derived.bearingToHomeDeg,
        homeDistanceM:  derived.distanceToHomeM,
        wpBearingDeg:   derived.bearingToWaypointDeg,
        wpDistanceM:    derived.distanceToWaypointM,
      };
      wd.setNavContext(ctx);
    }
  }, [telemetry, homePosition, activeWaypoint, batteryCapacityMah]);

  // ── Render ────────────────────────────────────────────────────────────
  //
  // Glass-cockpit overlay layout:
  //   All canvas elements are absolutely positioned within .hud-canvas-zone.
  //   The artificial horizon fills the entire zone (background layer, z-index 0).
  //   Speed tape, altitude tape, VSI and heading tape sit on top as overlays.
  //   The navigation strip runs the full width at the bottom (z-index 3).
  //
  //   CSS percentages in hud-layout.css set each canvas's position + size.
  //   useHUDResize observes each canvas individually — each instrument
  //   receives its own correct dimensions, not a shared container size.
  return (
    <div className="hud-panel">
      <div className="hud-canvas-zone">

        {/* 0. Artificial Horizon — full-canvas background */}
        <canvas className="hud-cvs hud-cvs--horizon" ref={horizonCanvasRef} />

        {/* 1. Speed Tape — left edge */}
        <canvas className="hud-cvs hud-cvs--speed" ref={speedCanvasRef} />

        {/* 2. Altitude Tape — right edge (inset for VSI) */}
        <canvas className="hud-cvs hud-cvs--altitude" ref={altitudeCanvasRef} />

        {/* 3. VSI — far-right column */}
        <canvas className="hud-cvs hud-cvs--vsi" ref={vsiCanvasRef} />

        {/* 4. Heading Tape — top-center band */}
        <canvas className="hud-cvs hud-cvs--heading" ref={headingCanvasRef} />

        {/* 5. Navigation Strip — bottom full-width (GS | BRG | WP DIST | HDG) */}
        <canvas className="hud-cvs hud-cvs--waypoint" ref={waypointCanvasRef} />

        {/* 6. Throttle — narrow vertical gauge */}
        <canvas className="hud-cvs hud-cvs--throttle" ref={throttleCanvasRef} />

        {/* Debug overlay — solo visible en desarrollo/diagnóstico */}
        {showDebugOverlay && (
          <HUDDebugOverlay
            getSnapshot={() => activeSnapshotRef.current?.getSnapshot() ?? telemetryRef.current}
          />
        )}

      </div>
    </div>
  );
};

export default FlightHUD;
