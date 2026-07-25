/**
 * ProjectionEngine.ts — Perspective Projection for Synthetic Vision
 *
 * ════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ════════════════════════════════════════════════════════════════════════
 *
 * Converts terrain elevation data from TerrainEngine into 2D screen
 * coordinates in the ArtificialHorizon's world frame, ready for
 * immediate Canvas 2D polygon rendering.
 *
 * ════════════════════════════════════════════════════════════════════════
 * PROJECTION MATH
 * ════════════════════════════════════════════════════════════════════════
 *
 * For a terrain point at forward distance  d  (metres) and elevation
 * e  (metres MSL), with the aircraft at altitude  a  (metres MSL):
 *
 *   relativeAlt    = e − a
 *   vertAngle_rad  = atan2(relativeAlt, d)
 *   vertAngle_deg  = vertAngle_rad × (180 / π)
 *
 * In the ArtificialHorizon world frame (after pitch/roll transforms):
 *   • y = 0  is the true horizon
 *   • y < 0  is above the horizon  (sky / terrain peaks)
 *   • y > 0  is below the horizon  (ground)
 *
 * Therefore:
 *   screenY = −vertAngle_deg × pxPerDeg
 *
 *   If terrain is ABOVE the aircraft (relativeAlt > 0):
 *     atan2 > 0 → screenY < 0 → drawn above horizon ✓
 *
 *   If terrain is BELOW the aircraft (relativeAlt < 0):
 *     atan2 < 0 → screenY > 0 → drawn below horizon ✓
 *
 * For lateral (horizontal) positioning:
 *   The lateral angle was already computed by TerrainEngine and
 *   pre-multiplied by pxPerDeg in updateLateralCache():
 *
 *   screenX = lateralAngle_deg × pxPerDeg
 *
 * The world frame is already:
 *   1. Centred at instrument origin — translate(cx, cy)
 *   2. Rotated by −rollRad         — ctx.rotate(−rollRad)
 *   3. Shifted by pitchOffset      — ctx.translate(0, pitchOffset)
 *
 * So the projected (screenX, screenY) values can be used directly
 * as Canvas 2D coordinates within the world-frame drawing phase.
 *
 * ════════════════════════════════════════════════════════════════════════
 * PERFORMANCE CONTRACT
 * ════════════════════════════════════════════════════════════════════════
 *
 *   • ZERO heap allocation per frame.
 *   • Output stored in pre-allocated Float64Array buffers.
 *   • Lateral screenX values are cached per resize (pxPerDeg-dependent).
 *   • Only vertical screenY changes per frame (altitude-dependent).
 *
 * ════════════════════════════════════════════════════════════════════════
 * FUTURE EXTENSIONS
 * ════════════════════════════════════════════════════════════════════════
 *
 *   • Curved-earth correction for long range (> 50 km).
 *   • Vanishing-point perspective convergence.
 *   • Real DEM tile-based projection with terrain-following camera.
 */

const RAD_TO_DEG = 180 / Math.PI;

export class ProjectionEngine {
  /** Projected screen X coordinates (world-frame pixels). */
  private readonly _xs: Float64Array;

  /** Projected screen Y coordinates (world-frame pixels). */
  private readonly _ys: Float64Array;

  /**
   * Pre-computed lateral screen X per column.
   * Recalculated once per resize (when pxPerDeg changes).
   */
  private readonly _lateralScreenX: Float64Array;

  private readonly _maxColumns: number;

  // ── Public accessors — read-only views of output buffers ───────────
  get xs(): Float64Array { return this._xs; }
  get ys(): Float64Array { return this._ys; }

  constructor(maxColumns: number) {
    this._maxColumns     = maxColumns;
    this._xs             = new Float64Array(maxColumns);
    this._ys             = new Float64Array(maxColumns);
    this._lateralScreenX = new Float64Array(maxColumns);
  }

  /**
   * Pre-compute lateral screen X positions from lateral angles.
   *
   * Call once per instrument resize — NOT per frame.
   * After this call, projectSlice() copies the cached X values
   * directly instead of recomputing them.
   *
   * @param lateralAngles  Lateral angle per column in degrees (from TerrainEngine).
   * @param pxPerDeg       Pixels per degree (from ArtificialHorizon resize).
   */
  updateLateralCache(lateralAngles: Float64Array, pxPerDeg: number): void {
    const n = Math.min(lateralAngles.length, this._maxColumns);
    for (let i = 0; i < n; i++) {
      this._lateralScreenX[i] = lateralAngles[i] * pxPerDeg;
    }
  }

  /**
   * Projects one terrain slice (all columns) to screen coordinates.
   *
   * After calling, read the results from this.xs and this.ys.
   *
   * ZERO ALLOCATION: writes into pre-allocated _xs and _ys buffers.
   *
   * @param distance     Forward distance of this slice (metres).
   * @param elevations   Flat elevation buffer from TerrainEngine.
   * @param elevOffset   Starting index in elevations for this slice.
   * @param count        Number of columns to project.
   * @param aircraftAlt  Aircraft altitude MSL (metres).
   * @param pxPerDeg     Pixels per degree of pitch (from instrument).
   */
  projectSlice(
    distance:    number,
    elevations:  Float64Array,
    elevOffset:  number,
    count:       number,
    aircraftAlt: number,
    pxPerDeg:    number,
  ): void {
    const xs = this._xs;
    const ys = this._ys;
    const lx = this._lateralScreenX;

    for (let c = 0; c < count; c++) {
      // Lateral: pre-computed in updateLateralCache
      xs[c] = lx[c];

      // Vertical: perspective projection via atan2
      const relAlt = elevations[elevOffset + c] - aircraftAlt;
      ys[c] = -Math.atan2(relAlt, distance) * RAD_TO_DEG * pxPerDeg;
    }
  }
}
