/**
 * interpolationConfig.ts
 *
 * Centralised configuration for the TelemetryInterpolator.
 *
 * All tunable constants are exported from here — zero magic numbers in the
 * interpolator itself.  Adjust these values to change visual behaviour
 * without touching the core algorithm.
 *
 * ── Tuning guide ──────────────────────────────────────────────────────────
 *
 *  INTERP_PREDICT_BEYOND_LAST
 *    true  — when the latest packet is overdue (t > 1) the interpolator
 *            projects the drone forwards using its NED velocity vector.
 *            Keeps the model moving smoothly between slow GPS updates (10 Hz).
 *    false — hold the last confirmed position when packets are late.
 *            Safer during first-connect before velocity fields are valid.
 *
 *  INTERP_PREDICT_CAP_MS
 *    Maximum dead-reckoning window (ms) from the last confirmed snapshot B.
 *    After this cap the interpolator holds steady at B.
 *    Recommended range: 80–200 ms.
 *      → Too low:  micro-stutters visible at 10 Hz GPS (100 ms packet gap).
 *      → Too high: model drifts visibly from truth during a real dropout.
 *    Default 150 ms covers one full 10 Hz GPS interval with 50 ms headroom.
 *
 *  INTERP_HISTORY_DEPTH
 *    Number of snapshot slots in the ring buffer.
 *    2 = minimum for A↔B linear lerp.
 *    4 = reserved for future Catmull-Rom spline mode (smoother turn arcs).
 *    Do not decrease below 2.
 */

/** Enable dead-reckoning projection when the latest packet is overdue. */
export const INTERP_PREDICT_BEYOND_LAST: boolean = true;

/**
 * Maximum dead-reckoning window (ms) measured from the last confirmed snapshot.
 * After this cap the interpolator holds the last value until a new packet arrives.
 *
 * Aumentado de 150 → 200: cubre un intervalo GPS 10Hz (100ms) con 100ms de headroom.
 * Elimina micro-stutters cuando el GPS llega justo en el límite del cap.
 */
export const INTERP_PREDICT_CAP_MS: number = 200;

/**
 * Ring-buffer depth for snapshot history.
 * 2 = minimum for A↔B lerp.
 * 4 = reserved for future Catmull-Rom spline interpolation.
 */
export const INTERP_HISTORY_DEPTH: number = 4;
