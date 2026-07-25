/**
 * NavigationOverlay.tsx
 *
 * SVG/HTML overlay rendered on top of the ArtificialHorizon canvas.
 * Provides mission-navigation symbology in the glass cockpit style
 * (Garmin G1000 / Dynon SkyView inspired).
 *
 * Symbols drawn (all positioned relative to the horizon center):
 *
 *   ① Aircraft reference symbol  — fixed white W/chevron at center
 *   ② Waypoint bearing pointer   — magenta arrow ring, rotates to WP direction
 *                                   relative to current heading
 *   ③ Cross-track error bar      — magenta horizontal offset of bearing pointer
 *
 * All elements are pure CSS/SVG — zero canvas operations.
 * The overlay sits at "position: absolute; inset: 0" and is pointer-events: none.
 */

import React, { useMemo } from 'react';
import type { FlightTelemetry } from '../../telemetry';

// ── Constants ─────────────────────────────────────────────────────────────

/** Magenta — active navigation color */
const COLOR_NAV  = '#ff3eb5';
/** Aircraft reference symbol color */
/** Ring radius fraction of the shorter canvas dimension */
const RING_FRAC  = 0.34;
/** Aircraft symbol wing half-span (viewBox units) */

// ── Sub-component: Aircraft Reference Symbol ──────────────────────────────

// ── Sub-component: Bearing Pointer ────────────────────────────────────────

/**
 * Magenta single-bar bearing pointer.
 * `relativeDeg` is the waypoint bearing relative to aircraft heading.
 * Rotates around the center of the viewBox (0,0 in the local coordinate system).
 */
function BearingPointer({ relativeDeg, radius }: { relativeDeg: number; radius: number }): React.ReactElement {
  const sw    = 2.5;
  const arrow = radius * 0.72;   // length of the pointer line from center
  const tip   = radius + 4;      // arrowhead tip
  const ahw   = 5;               // arrowhead half-width

  return (
    <g
      stroke={COLOR_NAV}
      fill={COLOR_NAV}
      strokeWidth={sw}
      transform={`rotate(${relativeDeg})`}
    >
      {/* Pointer line from center toward waypoint */}
      <line x1={0} y1={0} x2={0} y2={-(arrow)} />
      {/* Arrowhead at the tip */}
      <polygon
        points={`0,${-(tip)} ${-ahw},${-(tip - ahw * 1.4)} ${ahw},${-(tip - ahw * 1.4)}`}
        strokeWidth={1}
      />
      {/* Tail stub (opposite side) */}
      <line x1={0} y1={0} x2={0} y2={radius * 0.3} strokeOpacity={0.5} />
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface NavigationOverlayProps {
  telemetry: FlightTelemetry;
}

const NavigationOverlay: React.FC<NavigationOverlayProps> = ({ telemetry }) => {
  const { navigation } = telemetry;
  const hdg   = navigation.headingDeg;
  const wpBrg = navigation.bearingToWaypointDeg;

  // Relative bearing: direction to waypoint from current heading [0, 360)
  const relBrg: number | null = useMemo(() =>
    wpBrg != null ? ((wpBrg - hdg + 360) % 360) : null,
    [wpBrg, hdg],
  );

  const hasMission = relBrg != null;

  // viewBox: 200×200, origin at top-left. Center = (100, 100).
  const VW = 200;
  const VH = 200;
  const cx = VW / 2;
  const cy = VH / 2;
  const ringR = Math.min(VW, VH) * RING_FRAC;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        position:       'absolute',
        inset:          0,
        width:          '100%',
        height:         '100%',
        pointerEvents:  'none',
        overflow:       'hidden',
      }}
      aria-hidden="true"
    >
      {/* ── Waypoint bearing ring (thin magenta circle) ───────────── */}
      {hasMission && (
        <circle
          cx={cx} cy={cy}
          r={ringR}
          stroke={COLOR_NAV}
          strokeWidth={1}
          strokeOpacity={0.45}
          fill="none"
        />
      )}

      {/* Bearing pointer centered on horizon ──────────────────── */}
      {hasMission && (
        <g transform={`translate(${cx},${cy})`}>
          <BearingPointer relativeDeg={relBrg!} radius={ringR} />
        </g>
      )}

      {/* Aircraft reference symbol — fixed white symbol at center ────── */}
      <g transform={`translate(${cx},${cy})`}>

      </g>
    </svg>
  );
};

export default NavigationOverlay;
