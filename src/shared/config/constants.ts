/**
 * constants.ts
 *
 * Application-wide named constants — replace all magic numbers/strings that
 * previously appeared inline across components, hooks, and utilities.
 *
 * Rules:
 *  - Only true cross-component constants belong here.
 *  - Component-private magic numbers should stay local to that file.
 */

// ── Locale ────────────────────────────────────────────────────────────────

export const CLOCK_LOCALE = 'es-ES' as const;

/** BCP-47 locale used for all English-language log timestamps. */
export const LOG_LOCALE = 'en-US' as const;

// ── Home position (fallback until GPS first-fix) ──────────────────────────

export const HOME_POSITION = {
  latitude:     28.4567,
  longitude:    -16.3219,
  altitudeMSLm: 520,
} as const;

// ── Battery ───────────────────────────────────────────────────────────────

export const DEFAULT_BATTERY_CAPACITY_MAH = 5200;

// ── Flight defaults ───────────────────────────────────────────────────────

/** Default AGL takeoff / waypoint altitude used when planning missions. */
export const DEFAULT_WAYPOINT_ALTITUDE_M = 30;

// ── Event log ─────────────────────────────────────────────────────────────

/** Maximum flight events kept per drone in the log store before pruning. */
export const MAX_EVENTS_PER_DRONE = 500;

// ── Connection ────────────────────────────────────────────────────────────

/** Simulated MAVLink handshake delay (ms) — replace with real timeout when wired. */
export const SIMULATED_CONNECT_DELAY_MS = 600;

// ── UI feedback timings ───────────────────────────────────────────────────

/** Milliseconds a loading spinner is shown after a command is dispatched. */
export const LOADING_FEEDBACK_DELAY_MS = 800;

// ── Flight log panel ──────────────────────────────────────────────────────

/** Pixels from the bottom of the scroll container within which auto-scroll re-enables. */
export const AUTO_SCROLL_THRESHOLD_PX = 40;

// ── Failsafe / airborne detection ────────────────────────────────────────

/** AGL altitude (metres) above which the vehicle is considered airborne. */
export const AIRBORNE_ALTITUDE_M = 1;

// ── Telemetry formatters ──────────────────────────────────────────────────

/** Distance threshold above which metres are converted to kilometres. */
export const KM_THRESHOLD = 1_000;

/** Track-error deadband (degrees): within this range the label is "ON TRK". */
export const TRACK_ERROR_DEADBAND_DEG = 2;

// ── Motion / animation ────────────────────────────────────────────────────

/** Spring easing array used for panel/view transitions throughout the UI. */
export const EASING_SPRING = [0.22, 1, 0.36, 1] as const;

/** Duration for fast micro-transitions (panel content swap). */
export const TRANSITION_DURATION_FAST = 0.18;

/** Duration for full-view transitions (PLAN ↔ FLIGHT). */
export const TRANSITION_DURATION_VIEW = 0.25;
