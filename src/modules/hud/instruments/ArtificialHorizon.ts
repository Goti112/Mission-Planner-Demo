/**
 * ArtificialHorizon.ts — Attitude Direction Indicator (ADI)
 *
 * ════════════════════════════════════════════════════════════════════════
 * COORDINATE SYSTEM & RENDERING PHILOSOPHY
 * ════════════════════════════════════════════════════════════════════════
 *
 * In real aviation instruments the WORLD rotates — the aircraft symbol
 * stays fixed at the centre of the display.  When the pilot banks right
 * the horizon tilts left; the miniature-airplane wings remain level.
 *
 * This implementation follows the same convention:
 *
 *   1. The canvas context is clipped to a circular bezel.
 *   2. ctx.translate(cx, cy)         — origin at instrument centre.
 *   3. ctx.rotate(−rollRad)          — the WORLD rotates opposite to
 *                                      the aircraft's bank angle.
 *   4. ctx.translate(0, pitchOffset) — the world shifts DOWN when pitch
 *                                      rises (nose up → horizon below
 *                                      centre).
 *   5. Sky, ground, horizon line & pitch ladder are painted in this
 *      rotated reference frame.
 *   6. ctx.restore()                 — back to screen coordinates.
 *   7. Roll scale and aircraft symbol are painted in screen space.
 *      They NEVER rotate.
 *
 * WHY THE WORLD ROTATES AND NOT THE AIRCRAFT:
 *   Real attitude indicators present an "outside-in" view.  The pilot
 *   sees a synthetic horizon that moves exactly like the real one seen
 *   through the windscreen.  Rolling the aircraft 30° right causes the
 *   horizon to tilt 30° left on the display — the aircraft symbol stays
 *   wings-level because the pilot IS the aircraft.  Rotating the symbol
 *   instead would create a confusing "outside" perspective.
 *
 * PITCH LADDER TEXT COUNTER-ROTATION:
 *   Labels on the pitch ladder are COUNTER-ROTATED (+rollRad) inside the
 *   world frame so they stay readable regardless of bank angle, matching
 *   modern glass cockpits (Garmin G1000, Collins Pro Line Fusion, Dynon
 *   SkyView).
 *
 * ════════════════════════════════════════════════════════════════════════
 *
 * Inputs:   FlightTelemetry  (reads attitude.pitchDeg, attitude.rollDeg)
 * Render:   Canvas 2D — called every frame by the global rAF loop
 * Base:     CanvasInstrument (DPI-aware resize, theme, clear)
 *
 * Extensiones futuras:
 *   - Flight Path Vector (FPV)
 *   - Synthetic Vision (DTM terrain rendering)
 *   - Slip / Skid ball
 *   - Unusual attitude recovery chevrons
 */

import { CanvasInstrument } from '../core/CanvasInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { HUDTheme } from '../core/HUDTheme';
import { TerrainEngine } from '../core/TerrainEngine';
import { ProjectionEngine } from '../core/ProjectionEngine';
import {
  DEG_TO_RAD,
  TWO_PI,
  perspScale,
  pitchLineAlpha,
  rollTickLen,
  rollTickColor,
  pointerColor,
  buildSliceColors,
} from './artificialHorizonDrawing';

// ── Pitch configuration ──────────────────────────────────────────────
/**
 * Degrees of pitch visible from the instrument centre to the bezel edge.
 * Controls the "zoom" level of the attitude display.
 * 25° is standard for general-aviation PFDs.
 */
const PITCH_VISIBLE_RANGE = 25;

/** Minor pitch lines drawn every 5°. */
const PITCH_STEP_MINOR = 5;
/** Major pitch lines (longer, with labels) drawn every 10°. */
const PITCH_STEP_MAJOR = 10;
/** Maximum pitch angle rendered on the ladder. */
const PITCH_MAX_DEG = 90;

// ── Roll configuration ───────────────────────────────────────────────
/** Standard ADI roll tick positions (absolute degrees). */
const ROLL_TICK_ANGLES = [0, 10, 20, 30, 45, 60, 70, 80, 90] as const;


export class ArtificialHorizon extends CanvasInstrument {
  // ── Cached layout metrics — recalculated once per resize, never per frame ──
  private _cx       = 0;   // horizontal centre (CSS px)
  private _cy       = 0;   // vertical centre (CSS px)
  private _r        = 0;   // instrument bezel radius (CSS px)
  private _pxPerDeg = 0;   // vertical pixels per degree of pitch

  // Derived from _r — cached in resize() so draw() is allocation-free
  private _skyExtent      = 0;   // sky/ground fill over-draw extent
  private _horizHalfLen   = 0;   // half-length of the horizon line
  private _horizLineW     = 0;   // horizon line stroke width
  private _majorHalf      = 0;   // half-width of 10° pitch lines
  private _minorHalf      = 0;   // half-width of 5° pitch lines
  private _textGap        = 0;   // gap between pitch line end and label
  private _endTickH       = 0;   // perpendicular end-tick height
  private _cullY          = 0;   // cull threshold for pitch lines
  private _ladderMajorLW  = 0;   // pitch major line stroke width
  private _ladderMinorLW  = 0;   // pitch minor line stroke width
  private _pitchFontStr   = '';  // pre-built font string for pitch labels
  /** Pre-cached label x-offset: majorHalf + textGap + (fontSize × 0.7). */
  private _fullLabelOffset = 0;  // cached in resize() — avoids per-frame arithmetic
  private _arcR           = 0;   // roll scale arc radius
  private _arcFrom        = 0;   // roll arc start angle (rad)
  private _arcTo          = 0;   // roll arc end angle (rad)
  private _rollArcLW      = 0;   // roll arc stroke width
  private _tickS          = 0;   // short roll tick length (10°,20°)
  private _tickM          = 0;   // medium roll tick length (30°)
  private _tickL          = 0;   // long roll tick length (0°,45°,60°,70°,80°,90°)
  private _triH           = 0;   // roll pointer triangle height
  private _triW           = 0;   // roll pointer triangle half-width
  private _wingSpan       = 0;   // aircraft symbol half wing-span
  private _wingGap        = 0;   // aircraft symbol wing-to-centre gap
  private _barThick       = 0;   // aircraft symbol bar thickness
  private _dotRadius      = 0;   // aircraft symbol fuselage dot radius
  private _wingDrop       = 0;   // aircraft symbol wing-tip vertical drop

  // ── Synthetic Vision 2.5D ──────────────────────────────────────────
  private readonly _terrain:    TerrainEngine;
  private readonly _projection: ProjectionEngine;
  private readonly _sliceColors:        string[];
  private readonly _sliceWarningColors: string[];
  private readonly _ridgeColors:        string[];
  private _svEnabled   = true;
  private _ridgeLineW  = 0;
  /**
   * When true the circular bezel clip is skipped — the sky/ground fill
   * the entire canvas rectangle.  Set to true for glass-cockpit PFD mode
   * where the horizon is the background layer and tapes overlay it.
   */
  private _rectangular = false;

  // ── Roll scale labels ─────────────────────────────────────────────────
  /** Pre-built font string for roll scale numeric labels. */
  private _rollFontStr = '';
  /** Radius at which roll scale labels are centred (just outside the arc). */
  private _rollLabelR  = 0;

  // ── 2.5D Perspective & Parallax ───────────────────────────────────────
  //
  // PERSPECTIVE MODEL
  // -----------------
  // We simulate a 75° vertical field-of-view using a simple reciprocal
  // depth foreshortening function applied to each pitch-ladder line:
  //
  //   perspScale(y) = 1 / (1 + |y| × _perspK)
  //
  // where _perspK = 1 / (_cullY × 1.8).
  // At y=0 (horizon) scale = 1.0 (no compression).
  // At y=cullY (top/bottom bezel) scale ≈ 0.36 (strong foreshortening).
  // This keeps the 10° rungs wider near centre (as in a real cockpit view)
  // and narrower toward the extremes — matching what aviators see looking
  // out the windscreen.
  //
  // PARALLAX MODEL
  // --------------
  // Three depth layers move at different rates relative to pitch:
  //   Background (sky dome / ground)  : factor 0.85 × pitchOffset
  //   Mid-ground (pitch ladder)       : factor 1.00 × pitchOffset  (reference)
  //   Foreground (aircraft symbol)    : fixed in screen space (0×)
  //
  // The 15 % lag of the background creates a subtle but perceptible depth
  // cue — exactly as seen in real cockpit simulators.  The difference is
  // intentionally small (< 1 pixel per 5° pitch) so it never confuses
  // the attitude reading.
  //
  // HORIZON CURVATURE
  // -----------------
  // A single cubic bézier arc replaces the straight horizon line.
  // The mid-point sag is _horizSag px (scaled with r).  At 0° roll and
  // small pitch deviations this is nearly imperceptible; at ±30° roll
  // the curve becomes subtly visible — matching Earth's apparent curvature
  // from typical UAV/aircraft operating altitudes.
  //
  // All values are pre-computed in resize() — zero arithmetic in draw().

  /** Perspective reciprocal coefficient: 1/(cullY × 1.8). */
  private _perspK        = 0;
  /** Parallax offset for background layer: pitchOffset × 0.85 */
  private _bgParallax    = 0;   // written each frame in draw() — scalar
  /** Horizon bézier mid-point sag (world-frame px). */
  private _horizSag      = 0;
  /** Horizon curvature control-point x distance from centre. */
  private _horizCurveCpX = 0;

  constructor(canvas: HTMLCanvasElement, theme?: HUDTheme) {
    super(canvas, theme);

    // Synthetic Vision engine — pre-allocated buffers, ZERO alloc per frame
    this._terrain    = new TerrainEngine();
    this._projection = new ProjectionEngine(this._terrain.columns);

    // Pre-compute slice colour tables — reused every frame, never re-allocated
    const colors = buildSliceColors(this._terrain.slices);
    this._sliceColors        = colors.sliceColors;
    this._sliceWarningColors = colors.sliceWarningColors;
    this._ridgeColors        = colors.ridgeColors;
  }

  /**
   * Enable or disable synthetic vision terrain rendering.
   * When disabled, the standard flat sky/ground colours are shown.
   */
  setSyntheticVision(enabled: boolean): void {
    this._svEnabled = enabled;
  }

  /**
   * Toggle rectangular versus circular-bezel rendering.
   *
   * Circular mode (default) clips the horizon to a round bezel matching
   * a traditional round ADI instrument.  Rectangular mode removes the clip
   * so that sky and ground fill the full canvas — required for a modern
   * glass-cockpit PFD where the horizon is the background layer and speed /
   * altitude tapes are drawn on top as absolutely-positioned overlays.
   *
   * The sky / ground fill extents (_skyExtent) are already large enough to
   * cover any canvas size at any roll angle — no other resize changes needed.
   */
  setRectangularBezel(enabled: boolean): void {
    this._rectangular = enabled;
  }

  /**
   * Recalculates every proportion from the new canvas size.
   * All layout values derive from the instrument radius `_r`, which itself
   * derives from `min(width, height)`.  No absolute pixel constant appears
   * anywhere in the drawing code.
   */
  override resize(width: number, height: number): void {
    super.resize(width, height);
    const r = Math.min(this.width, this.height) * 0.45;
    this._cx       = (this.width / 2) + 2; // Symmetric centering + 2px offset for visual alignment
    this._cy       = this.height / 2;
    this._r        = r;
    this._pxPerDeg = r / PITCH_VISIBLE_RANGE;

    // Sky / ground — extent must cover the canvas diagonal at any roll angle.
    // Using the full diagonal guarantees no black corners during rolls, and
    // includes extra headroom for pitch offset at extreme attitudes.
    const diagonal    = Math.hypot(this.width, this.height);
    this._skyExtent   = Math.max(diagonal, r * 3 + PITCH_MAX_DEG * this._pxPerDeg);
    // Horizon line
    this._horizHalfLen = r * 1.6;
    this._horizLineW   = Math.max(2.5, r * 0.018);
    // Pitch ladder
    this._majorHalf    = r * 0.22;
    this._minorHalf    = r * 0.11;
    this._textGap      = r * 0.035;
    this._endTickH     = r * 0.035;
    this._cullY        = r * 5.0;  // Increased to allow visibility up to 90° even at level flight
    this._ladderMajorLW = Math.max(2.0, r * 0.014);
    this._ladderMinorLW = Math.max(0.8, r * 0.006);
    const pitchFontSz  = Math.max(9.9, Math.round(r * 0.0935));
    this._pitchFontStr = `bold ${pitchFontSz}px ${this.theme.fontHUD}`;
    // Pre-compute label offset so draw() allocates nothing for this calculation.
    // labelOffset = distance from pitch-line end to label centre.
    this._fullLabelOffset = this._majorHalf + this._textGap + pitchFontSz * 0.7;
    // Roll scale
    this._arcR    = r * 0.90; // Restored to original larger size
    this._arcFrom = (-90 - 90) * DEG_TO_RAD;
    this._arcTo   = (-90 + 90) * DEG_TO_RAD;
    this._rollArcLW = Math.max(1, r * 0.007);
    this._tickS   = r * 0.045;
    this._tickM   = r * 0.07;
    this._tickL   = r * 0.10;
    this._triH    = r * 0.065;
    this._triW    = r * 0.04;
    // Roll scale labels
    const rollFontSz  = Math.max(7.7, Math.round(r * 0.0715));
    this._rollFontStr = `${rollFontSz}px ${this.theme.fontHUD}`;
    this._rollLabelR  = this._arcR + Math.max(5, r * 0.042);
    // Aircraft symbol
    this._wingSpan   = r * 0.32;
    this._wingGap    = r * 0.06;
    this._barThick   = Math.max(3, r * 0.025);
    this._dotRadius  = Math.max(3, r * 0.03);
    this._wingDrop   = r * 0.045;

    // Synthetic Vision — update projection lateral cache when pxPerDeg changes
    this._ridgeLineW = Math.max(0.5, r * 0.004);
    this._projection.updateLateralCache(this._terrain.lateralAngles, this._pxPerDeg);

    // 2.5D — perspective and parallax constants
    // _perspK: at |y| = _cullY the line width scales to 1/(1 + cullY×perspK).
    // Chosen so the outermost visible line is ~0.36× the horizon width.
    this._perspK        = 1 / (this._cullY * 1.8);
    // _horizSag: mid-point vertical sag of the horizon curvature arc.
    // 0.014×r gives a subtle ~2 px sag at typical PFD sizes — not game-like.
    this._horizSag      = r * 0.014;
    // Control-point x: placed at 60% of the horizon half-length so the
    // bézier arc is smooth and doesn't overshoot.
    this._horizCurveCpX = this._horizHalfLen * 0.60;
  }

  // ════════════════════════════════════════════════════════════════════
  //  MAIN DRAW — invoked every animation frame by useHUDLoop
  // ════════════════════════════════════════════════════════════════════

  override draw(data: Readonly<FlightTelemetry>): void {
    const { pitchDeg, rollDeg } = data.attitude;
    const { latitude, longitude, headingDeg } = data.navigation;
    const { altitudeMSLm } = data.altitude;
    const { ctx } = this;
    const cx       = this._cx;
    const cy       = this._cy;
    const r        = this._r;
    const pxPerDeg = this._pxPerDeg;

    // Guard: canvas has not been measured yet
    if (r === 0) return;

    this.clear();

    // Update terrain elevation grid (ZERO allocation — writes to pre-allocated buffers)
    if (this._svEnabled) {
      this._terrain.update(latitude, longitude, headingDeg);
    }

    const rollRad     = rollDeg * DEG_TO_RAD;
    const pitchOffset = pitchDeg * pxPerDeg;

    // 2.5D: background parallax — shift applied to gradient anchor points only.
    // Shifting the gradient (not the fill rect) keeps sky/ground meeting exactly
    // at y=0 (no horizon seam) while the gradient tones appear to lag behind the
    // pitch-ladder reference by 15%, giving a subtle depth-plane separation.
    // Positive lag = gradient anchors move down → "horizon colour" recedes upward.
    this._bgParallax = pitchOffset * 0.15;  // gradient anchor delta (px)

    // ── PHASE 1 — World reference frame ──────────────────────────────
    //
    // Transform stack (applied in order):
    //   translate(cx, cy)         → origin moves to instrument centre
    //   rotate(−rollRad)          → the WORLD spins opposite to aircraft roll
    //   translate(0, pitchOffset) → world slides DOWN when nose pitches up
    //
    // After these transforms the local coordinate system is:
    //   y = 0   → true horizon
    //   y < 0   → sky (above horizon)
    //   y > 0   → ground (below horizon)
    // …all in the rotated, pitched world frame.

    ctx.save();

    if (!this._rectangular) {
      // Circular clip — simulates the glass bezel of a round ADI.
      // In rectangular (glass-cockpit PFD) mode this clip is skipped:
      // the sky/ground fills cover the full canvas so the horizon acts
      // as a background layer behind the overlaid tape panels.
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TWO_PI);
      ctx.clip();
    }

    ctx.translate(cx, cy);
    ctx.rotate(-rollRad);
    ctx.translate(0, pitchOffset);

    this.drawSky();
    this.drawGround();
    if (this._svEnabled) this.drawTerrain(altitudeMSLm);
    this.drawHorizonLine();
    this.drawPitchLadder(rollRad);

    ctx.restore();

    // ── PHASE 2 — Screen reference frame (fixed) ────────────────────
    //
    // Back to normal screen coordinates.
    // These elements are anchored to the display — they NEVER rotate.

    this.drawRollScale(cx, cy, rollDeg);
    this.drawAircraftSymbol(cx, cy);
    // Cinematic vignette — darkens edges for glass cockpit depth effect
    this.drawVignette(cx, cy);
  }

  // ════════════════════════════════════════════════════════════════════
  //  A) SKY — solid fill from far above down to the horizon (y = 0)
  //
  //  PARALLAX: the sky background is shifted up by _bgParallax relative
  //  to the pitch-ladder world frame.  When the nose pitches up, the
  //  pitch ladder moves down by pitchOffset; the sky dome moves down by
  //  only 0.85 × pitchOffset — the difference (_bgParallax = 0.15×) is
  //  applied here as a counter-translate, so the sky appears to sit on a
  //  deeper, slower-moving depth plane behind the pitch markings.
  //
  //  DEPTH GRADIENT: five-stop gradient from near-black zenith to a
  //  bright horizon fringe, simulating atmospheric scattering.
  // ════════════════════════════════════════════════════════════════════

  private drawSky(): void {
    const { ctx } = this;
    const ext = this._skyExtent;
    const lag = this._bgParallax;   // pre-computed in draw()

    // Parallax: gradient anchors are shifted DOWN by lag while the fill rect
    // stays fixed at y∈[−ext, 0].  At y=0 (horizon), the sampled gradient
    // colour moves slightly toward the zenith colours, making the sky appear
    // to recede behind the pitch-ladder layer without moving the fill boundary.
    const g = ctx.createLinearGradient(0, -ext + lag, 0, lag);
    g.addColorStop(0,    '#010408');  // near-black midnight sky at zenith
    g.addColorStop(0.18, '#041020');  // very deep navy
    g.addColorStop(0.45, '#071c48');  // deep aviation navy
    g.addColorStop(0.75, '#0d3572');  // rich aviation blue
    g.addColorStop(0.92, '#1e62b8');  // vivid blue
    g.addColorStop(1,    '#2878d0');  // bright horizon fringe — atmospheric scatter
    ctx.fillStyle = g;
    ctx.fillRect(-ext, -ext, ext * 2, ext);
  }

  // ════════════════════════════════════════════════════════════════════
  //  A) GROUND — solid fill from the horizon (y = 0) downward
  //
  //  PARALLAX: same 15% lag applied to ground layer.  The ground
  //  appears on a slightly closer depth plane than the sky dome,
  //  but still behind the pitch-ladder markings.
  //
  //  DEPTH GRADIENT: six-stop gradient — a bright near-horizon band
  //  transitions to dark far-ground, simulating terrain distance shading.
  //  The near-horizon band (stop 0→0.06) represents the lit ground at
  //  the horizon edge visible through haze; mid tones represent typical
  //  terrain at range; dark stops simulate far-field ground fading to black.
  // ════════════════════════════════════════════════════════════════════

  private drawGround(): void {
    const { ctx } = this;
    const ext = this._skyExtent;
    const lag = this._bgParallax;   // pre-computed in draw()

    // Parallax: gradient anchors shifted DOWN by lag.  The near-horizon warm
    // band "sinks" below y=0, making the ground appear slightly more distant.
    const g = ctx.createLinearGradient(0, lag, 0, ext + lag);
    g.addColorStop(0,    '#8a4c18');  // bright near-horizon band (haze-lit terrain)
    g.addColorStop(0.06, '#7a4012');  // warm golden-brown
    g.addColorStop(0.22, '#502808');  // rich mahogany
    g.addColorStop(0.50, '#2a1205');  // dark brown-black mid-range
    g.addColorStop(0.78, '#160a02');  // very dark far ground
    g.addColorStop(1,    '#0e0602');  // near-black far ground
    ctx.fillStyle = g;
    ctx.fillRect(-ext, 0, ext * 2, ext);
  }

  // ════════════════════════════════════════════════════════════════════
  //  SYNTHETIC VISION 2.5D — terrain rendering in world frame
  //
  //  Draws procedural terrain slices back-to-front (painter's algorithm).
  //  Each slice is a filled polygon representing the terrain elevation
  //  profile at a specific forward distance from the aircraft.
  //
  //  Near slices visually occlude far slices (natural z-ordering).
  //  Atmospheric perspective: far terrain is paler, near is darker.
  //  Terrain at or above aircraft altitude → amber/red warning colours.
  //
  //  Projection maths (per column per slice):
  //    vertAngle  = atan2(terrainElev − aircraftAlt, forwardDist)
  //    screenY    = −vertAngle_deg × pxPerDeg     (world frame)
  //    screenX    = lateralAngle_deg × pxPerDeg   (cached in resize)
  //
  //  ZERO ALLOCATION: all buffers pre-allocated in TerrainEngine and
  //  ProjectionEngine.  No objects, arrays, or strings created per frame.
  // ════════════════════════════════════════════════════════════════════

  private drawTerrain(altMSLm: number): void {
    const { ctx }    = this;
    const terrain    = this._terrain;
    const proj       = this._projection;
    const slices     = terrain.slices;
    const columns    = terrain.columns;
    const pxPerDeg   = this._pxPerDeg;
    const bottomY    = this._skyExtent;
    const elevations = terrain.elevations;

    // Back-to-front: distances[0] = farthest → distances[N−1] = nearest
    for (let s = 0; s < slices; s++) {
      const d      = terrain.distances[s];
      const offset = s * columns;

      // Project this slice to screen coordinates (→ proj.xs / proj.ys)
      proj.projectSlice(d, elevations, offset, columns, altMSLm, pxPerDeg);

      const xs = proj.xs;
      const ys = proj.ys;

      // Warning check: terrain at or above aircraft (30 m clearance)
      const isAbove = elevations[offset + (columns >> 1)] > altMSLm - 30;

      // ── Fill: terrain profile → bottom edge ──────────────────────
      ctx.fillStyle = isAbove
        ? this._sliceWarningColors[s]
        : this._sliceColors[s];

      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let c = 1; c < columns; c++) {
        ctx.lineTo(xs[c], ys[c]);
      }
      ctx.lineTo(xs[columns - 1], bottomY);
      ctx.lineTo(xs[0], bottomY);
      ctx.closePath();
      ctx.fill();

      // ── Ridge line: thin profile outline for depth perception ────
      // save/restore prevents strokeStyle and lineWidth from leaking
      // into subsequent drawHorizonLine / drawPitchLadder calls.
      ctx.save();
      ctx.strokeStyle = this._ridgeColors[s];
      ctx.lineWidth   = this._ridgeLineW;
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let c = 1; c < columns; c++) {
        ctx.lineTo(xs[c], ys[c]);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  B) HORIZON LINE — gently curved reference line at y = 0
  //
  //  CURVATURE: A cubic bézier arc replaces the straight line to simulate
  //  Earth's apparent curvature.  The curve is drawn as two symmetric
  //  halves (left and right of the centre gap):
  //
  //    Left half:  P0(-hl, 0) → CP(-cpX, -sag) → CP(-gap, 0) → P3(-gap, 0)
  //    Right half: P0(gap, 0) → CP(gap, 0)    → CP(cpX, -sag) → P3(hl, 0)
  //
  //  where sag = _horizSag (≈ 0.014×r) curves the mid-point slightly upward
  //  (negative y = up in world frame), mimicking the convex appearance of
  //  the horizon seen from altitude.
  //
  //  The sag is intentionally small — imperceptible below ±5° pitch but
  //  visible at larger deviations where curvature cues are most useful.
  // ════════════════════════════════════════════════════════════════════

  private drawHorizonLine(): void {
    const { ctx, theme } = this;
    const hl  = this._horizHalfLen;
    const lw  = this._horizLineW;
    const sag = this._horizSag;
    const cpX = this._horizCurveCpX;
    const gap = this._wingSpan + this._wingGap + this._r * 0.04;

    ctx.save();
    ctx.lineCap = 'round';

    // ── Soft glow halo — curved bézier, wide stroke ───────────────
    ctx.strokeStyle = 'rgba(200, 225, 255, 0.16)';
    ctx.lineWidth   = lw * 8;

    // Left half halo
    ctx.beginPath();
    ctx.moveTo(-hl, 0);
    ctx.bezierCurveTo(-cpX, -sag, -gap, 0, -gap, 0);
    ctx.stroke();

    // Right half halo
    ctx.beginPath();
    ctx.moveTo(gap, 0);
    ctx.bezierCurveTo(gap, 0, cpX, -sag, hl, 0);
    ctx.stroke();

    // ── Crisp main curved horizon line ───────────────────────────
    ctx.strokeStyle = theme.horizonLine;
    ctx.lineWidth   = lw;
    ctx.lineCap     = 'butt';

    // Left half
    ctx.beginPath();
    ctx.moveTo(-hl, 0);
    ctx.bezierCurveTo(-cpX, -sag, -gap, 0, -gap, 0);
    ctx.stroke();

    // Right half
    ctx.beginPath();
    ctx.moveTo(gap, 0);
    ctx.bezierCurveTo(gap, 0, cpX, -sag, hl, 0);
    ctx.stroke();

    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  //  C) PITCH LADDER
  //
  //  Minor lines every 5°, major lines every 10°.
  //  Major lines are longer and carry numeric labels on both sides.
  //  Major lines also have small perpendicular end-ticks pointing
  //  toward the horizon — the standard ADI visual cue that helps
  //  distinguish nose-up from nose-down at a glance.
  //
  //  Position formula (in world frame):
  //    y = −deg × pxPerDeg
  //  Positive pitch → line above horizon (negative y) ✓
  //
  //  TEXT COUNTER-ROTATION:
  //  We are inside the world frame, rotated by −rollRad.
  //  To keep labels upright we rotate each one by +rollRad, cancelling
  //  the world rotation for that specific text element.
  // ════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════
  //  C) PITCH LADDER — with perspective foreshortening
  //
  //  PERSPECTIVE FORESHORTENING
  //  --------------------------
  //  Each pitch line's half-width is multiplied by a perspective scale
  //  factor that decreases as the line moves away from the horizon:
  //
  //    perspScale(y) = 1 / (1 + |y| × _perspK)
  //
  //  _perspK is calibrated so the outermost visible line (|y| = cullY)
  //  is drawn at ~36% of the horizon-level width.  This matches how pitch
  //  rungs appear foreshortened in a real cockpit windscreen view — rungs
  //  near 0° pitch are wide; rungs near ±25° are much narrower.
  //
  //  The pitch-label offset is also scaled by perspScale so labels remain
  //  just outside their shortened lines.
  //
  //  VERTICAL SPACING: unchanged — perfectly linear deg×pxPerDeg.
  //  Only the horizontal extent is foreshortened, never the spacing,
  //  preserving correct pitch-angle readability.
  //
  //  OPACITY FADE
  //  ------------
  //  Lines more than 70% of cullY from the horizon fade to 40% opacity.
  //  This duplicates a real ADI: far-from-horizon lines are intentionally
  //  de-emphasised so the pilot focuses near 0°.
  // ════════════════════════════════════════════════════════════════════

  private drawPitchLadder(rollRad: number): void {
    const { ctx, theme } = this;
    const pxPerDeg    = this._pxPerDeg;
    const majorHalf   = this._majorHalf;
    const minorHalf   = this._minorHalf;
    const endTickH    = this._endTickH;
    const cullY       = this._cullY;
    const labelOffset = this._fullLabelOffset;
    const perspK      = this._perspK;

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = this._pitchFontStr;

    for (let deg = -PITCH_MAX_DEG; deg <= PITCH_MAX_DEG; deg += PITCH_STEP_MINOR) {
      if (deg === 0) continue; // horizon line is drawn separately

      const y    = -deg * pxPerDeg;
      const absY = Math.abs(y);
      if (absY > cullY) continue;

      const ps = perspScale(absY, perspK);
      const lineAlpha = pitchLineAlpha(absY, cullY);

      const isMajor = (deg % PITCH_STEP_MAJOR) === 0;

      // Foreshortened half-widths
      const halfW       = (isMajor ? majorHalf : minorHalf) * ps;
      const scaledLabel = labelOffset * ps;

      ctx.save();
      ctx.globalAlpha = lineAlpha;

      // ── Pitch line (NO shadow — crisp strokes only) ───────────────
      ctx.strokeStyle = theme.pitchLadder;
      ctx.lineWidth   = isMajor ? this._ladderMajorLW : this._ladderMinorLW;

      ctx.beginPath();
      ctx.moveTo(-halfW, y);
      ctx.lineTo( halfW, y);
      ctx.stroke();

      if (isMajor) {
        // ── Perpendicular end-ticks ──────────────────────────────────
        const tickDir = deg > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(-halfW, y);
        ctx.lineTo(-halfW, y + endTickH * tickDir);
        ctx.moveTo( halfW, y);
        ctx.lineTo( halfW, y + endTickH * tickDir);
        ctx.stroke();

        // ── Text labels — shadow scoped to text via save/restore ──
        const label = String(deg);  // Show negative values as negative digits

        // Left label
        ctx.save();
        ctx.shadowColor  = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur   = 4;
        ctx.fillStyle    = theme.pitchLadder;
        ctx.translate(-scaledLabel, y);
        ctx.rotate(rollRad);
        ctx.fillText(label, 0, 0);
        ctx.restore();

        // Right label
        ctx.save();
        ctx.shadowColor  = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur   = 4;
        ctx.fillStyle    = theme.pitchLadder;
        ctx.translate(scaledLabel, y);
        ctx.rotate(rollRad);
        ctx.fillText(label, 0, 0);
        ctx.restore();

        // ── Zenith / Nadir specific markers at ±90° ────────────────────
        if (Math.abs(deg) === 90) {
          ctx.beginPath();
          const symbolR = endTickH * 0.8;
          ctx.arc(0, y + symbolR * tickDir * 1.5, symbolR, 0, TWO_PI);
          ctx.stroke();
          if (deg > 0) {
             // Zenith dot
             ctx.beginPath();
             ctx.arc(0, y + symbolR * tickDir * 1.5, 2, 0, TWO_PI);
             ctx.fill();
          }
        }
      }

      ctx.restore();  // globalAlpha
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  D) ROLL SCALE — arc with tick marks at the top of the instrument
  //
  //  SKY-POINTER CONVENTION (matches Garmin G1000, Dynon SkyView, etc.):
  //    • The pointer triangle is FIXED at 12 o'clock — it represents the
  //      aircraft (the pilot IS the aircraft; the reference never moves).
  //    • The arc, tick marks and labels ROTATE opposite to the bank so
  //      the current bank-angle mark rises to meet the fixed pointer.
  //      A 30° right bank rotates the scale 30° left, bringing the "30"
  //      tick up to the pointer — exactly as seen on real glass cockpits.
  //
  //  Elements:
  //    • Arc from ±60° (measured from top) — rotates with the scale.
  //    • Tick marks at 0°, ±10°, ±20°, ±30°, ±45°, ±60° — rotate.
  //      Labels counter-rotate so numbers stay readable.
  //    • Fixed amber/yellow/green pointer triangle at top centre.
  // ════════════════════════════════════════════════════════════════════

  private drawRollScale(
    cx: number,
    cy: number,
    rollDeg: number,
  ): void {
    const { ctx, theme } = this;

    // All constants cached in resize() — zero arithmetic here
    const arcR  = this._arcR;
    const tickS = this._tickS;
    const tickM = this._tickM;
    const tickL = this._tickL;
    const triH  = this._triH;
    const triW  = this._triW;

    const rollRad = rollDeg * DEG_TO_RAD;

    // ── ROTATING bucket: arc + ticks + labels ─────────────────────
    // Translate to instrument centre, then counter-rotate by −rollRad so
    // the scale swings opposite to the aircraft bank.  When the plane banks
    // 30° right the scale rotates 30° left, bringing the "30" tick under
    // the fixed top pointer.  All coordinates inside this block are in the
    // rotated frame centred at (0, 0).
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-rollRad);

    // Arc outline
    ctx.lineWidth   = this._rollArcLW;
    ctx.strokeStyle = theme.rollArc;
    ctx.beginPath();
    ctx.arc(0, 0, arcR, this._arcFrom, this._arcTo);
    ctx.stroke();

    // Tick marks with bank-angle protection colouring
    for (const absDeg of ROLL_TICK_ANGLES) {
      const tickColor = rollTickColor(absDeg, theme);

      ctx.strokeStyle = tickColor;

      const sides = absDeg === 0 ? [0] : [absDeg, -absDeg];

      for (const deg of sides) {
        const angle = (-90 + deg) * DEG_TO_RAD;
        const cos   = Math.cos(angle);
        const sin   = Math.sin(angle);

        const len = rollTickLen(absDeg, tickS, tickM, tickL);

        ctx.beginPath();
        ctx.moveTo(arcR * cos,         arcR * sin);
        ctx.lineTo((arcR - len) * cos, (arcR - len) * sin);
        ctx.stroke();
      }
    }

    // Numeric labels — counter-rotated so they stay upright as the arc turns
    const labelR = this._rollLabelR;
    ctx.font         = this._rollFontStr;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (const absDeg of ROLL_TICK_ANGLES) {
      if (absDeg === 0) continue;   // fixed pointer already marks 0°
      const sides: number[] = [absDeg, -absDeg];
      for (const deg of sides) {
        const angle = (-90 + deg) * DEG_TO_RAD;
        const lx    = labelR * Math.cos(angle);
        const ly    = labelR * Math.sin(angle);
        ctx.save();
        ctx.fillStyle = theme.rollArc;
        ctx.translate(lx, ly);
        ctx.rotate(rollRad);   // counter-rotate: cancels the outer -rollRad
        ctx.fillText(String(absDeg), 0, 0);
        ctx.restore();
      }
    }

    ctx.restore();   // end rotating bucket

    // ── FIXED pointer at top centre (sky-pointer) ──────────────────
    // Always at 12 o'clock — represents the aircraft.
    // Colour escalates with bank angle for situational awareness.
    const rollAbs = Math.abs(rollDeg);
    const ptrColor = pointerColor(rollAbs, theme);

    const ptrTipR = arcR - tickS * 0.5;
    // 12 o'clock: angle = -PI/2 → cos = 0, sin = -1
    const ptrTx = cx;                  // cx + ptrTipR * 0
    const ptrTy = cy - ptrTipR;        // cy + ptrTipR * (-1)

    ctx.save();
    ctx.translate(ptrTx, ptrTy);
    // rotate(-PI/2 + PI/2) = rotate(0) — triangle naturally points inward
    ctx.fillStyle = ptrColor;
    ctx.beginPath();
    ctx.moveTo(0,     0);
    ctx.lineTo(-triW, triH);
    ctx.lineTo( triW, triH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  //  E) AIRCRAFT SYMBOL — fixed miniature-airplane at dead centre
  //
  //  This NEVER rotates.  It represents the aircraft's wings and nose
  //  as seen "from behind".  The pilot is the aircraft — everything
  //  else moves around this static reference.
  //
  //  Style: Garmin G1000 / Collins PFD pattern —
  //    two horizontal wing bars with small downward tips + centre dot.
  //
  //  Drawn in SCREEN coordinates — always level, always centred.
  // ════════════════════════════════════════════════════════════════════

  private drawAircraftSymbol(cx: number, cy: number): void {
    const { ctx } = this;

    const wingSpan  = this._wingSpan;    // all cached in resize()
    const wingGap   = this._wingGap;
    const barThick  = this._barThick;
    const dotRadius = this._dotRadius;
    const wingDrop  = this._wingDrop;

    // Pure white — clearly visible against both aviation-blue sky and brown ground.
    const color = '#ffffff';

    ctx.save();
    ctx.lineCap = 'round';

    // ── Soft glow halo — wide white aura for glass cockpit depth ─────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.fillStyle   = 'rgba(255, 255, 255, 0.13)';
    ctx.lineWidth   = barThick + 7;

    ctx.beginPath();
    ctx.moveTo(cx - wingGap,             cy);
    ctx.lineTo(cx - wingGap - wingSpan,  cy);
    ctx.lineTo(cx - wingGap - wingSpan,  cy + wingDrop);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + wingGap,             cy);
    ctx.lineTo(cx + wingGap + wingSpan,  cy);
    ctx.lineTo(cx + wingGap + wingSpan,  cy + wingDrop);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, dotRadius + 4, 0, TWO_PI);
    ctx.fill();

    // ── Dark shadow pass — ensures visibility over sky/terrain gradient ──
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.80)';
    ctx.fillStyle   = 'rgba(0, 0, 0, 0.80)';
    ctx.lineWidth   = barThick + 3;

    ctx.beginPath();
    ctx.moveTo(cx - wingGap,             cy);
    ctx.lineTo(cx - wingGap - wingSpan,  cy);
    ctx.lineTo(cx - wingGap - wingSpan,  cy + wingDrop);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + wingGap,             cy);
    ctx.lineTo(cx + wingGap + wingSpan,  cy);
    ctx.lineTo(cx + wingGap + wingSpan,  cy + wingDrop);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, dotRadius + 2, 0, TWO_PI);
    ctx.fill();

    // ── Main coloured aircraft symbol ─────────────────────────────────
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = barThick;

    // ── Left wing ──
    ctx.beginPath();
    ctx.moveTo(cx - wingGap,             cy);
    ctx.lineTo(cx - wingGap - wingSpan,  cy);
    ctx.lineTo(cx - wingGap - wingSpan,  cy + wingDrop);
    ctx.stroke();

    // ── Right wing ──
    ctx.beginPath();
    ctx.moveTo(cx + wingGap,             cy);
    ctx.lineTo(cx + wingGap + wingSpan,  cy);
    ctx.lineTo(cx + wingGap + wingSpan,  cy + wingDrop);
    ctx.stroke();

    // ── Centre dot (fuselage) ──
    ctx.beginPath();
    ctx.arc(cx, cy, dotRadius, 0, TWO_PI);
    ctx.fill();

    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  //  VIGNETTE OVERLAY
  //
  //  Drawn LAST in screen space — a radial dark-to-transparent gradient
  //  that creates a subtle cinematic edge-darkening effect.  This gives
  //  the instrument a glass cockpit "bezel depth" without any hard
  //  circular crop in rectangular (PFD) mode.
  //
  //  Gradient: transparent at centre → rgba(0,0,0,0.52) at the edges.
  // ════════════════════════════════════════════════════════════════════

  private drawVignette(cx: number, cy: number): void {
    const { ctx } = this;
    const r = this._r;
    // In rectangular mode extend to the canvas half-diagonal so the
    // darkening reaches all four corners.  In round mode, limit to the bezel.
    const outerR = this._rectangular
      ? Math.sqrt(this.width * this.width + this.height * this.height) * 0.55
      : r * 1.05;
    const g = ctx.createRadialGradient(cx, cy, r * 0.28, cx, cy, outerR);
    g.addColorStop(0,    'rgba(0, 0, 0, 0)');
    g.addColorStop(0.58, 'rgba(0, 0, 0, 0.04)');
    g.addColorStop(1,    'rgba(0, 0, 0, 0.52)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}
