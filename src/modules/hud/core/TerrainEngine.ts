/**
 * TerrainEngine.ts — Procedural Terrain Generation for Synthetic Vision
 *
 * ════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ════════════════════════════════════════════════════════════════════════
 *
 * Generates a 2D grid of terrain elevation samples in front of the
 * aircraft, suitable for real-time 2.5D Synthetic Vision rendering
 * on an Artificial Horizon canvas instrument.
 *
 * ════════════════════════════════════════════════════════════════════════
 * TERRAIN GRID LAYOUT (aircraft looking forward along heading)
 * ════════════════════════════════════════════════════════════════════════
 *
 *   ROWS   (slices)  — forward distance from aircraft.
 *     Logarithmically spaced: dense near the aircraft for detail,
 *     sparse at long range.  slice[0] = farthest, slice[N-1] = nearest.
 *     This order matches painter's algorithm draw order (far → near).
 *
 *   COLUMNS           — lateral angular positions spanning the FOV.
 *     Linearly spaced from −fovHalfDeg to +fovHalfDeg.
 *     column[0] = leftmost, column[N-1] = rightmost.
 *
 *   ELEVATIONS        — terrain elevation above sea level (metres).
 *     Stored row-major in a flat Float64Array: elevations[s * cols + c].
 *
 * ════════════════════════════════════════════════════════════════════════
 * NOISE ALGORITHM
 * ════════════════════════════════════════════════════════════════════════
 *
 * Hash-based 2D value noise with Hermite interpolation + FBM (Fractal
 * Brownian Motion) for multi-scale terrain features.  No external
 * dependency — all math is inline.
 *
 *   Octave 1 (freq 1×): major hills/valleys     — amplitude 100%
 *   Octave 2 (freq 2×): ridges/secondary relief — amplitude  50%
 *   Octave 3 (freq 4×): small undulations        — amplitude  25%
 *   Octave 4 (freq 8×): micro bumps              — amplitude  12%
 *
 * Noise input = world position in "terrain units" (lon/lat → metres →
 * divide by noiseScaleM).  Same world position always produces the same
 * elevation → terrain is spatially coherent as the aircraft moves.
 *
 * ════════════════════════════════════════════════════════════════════════
 * PERFORMANCE CONTRACT
 * ════════════════════════════════════════════════════════════════════════
 *
 *   • ZERO heap allocation per frame.  All buffers are pre-allocated
 *     in the constructor and reused on every update().
 *   • Dirty check: skips regeneration when lat/lon/heading haven't
 *     changed significantly (Δlat/lon < 5×10⁻⁵ ≈ 5.6 m, Δhdg < 1°).
 *   • Trigonometric values for lateral columns are pre-computed once.
 *
 * ════════════════════════════════════════════════════════════════════════
 * FUTURE EXTENSIONS
 * ════════════════════════════════════════════════════════════════════════
 *
 *   • Replace procedural noise with real DEM tiles (SRTM, DTED, etc.)
 *     by overriding the elevation lookup.
 *   • Inject Cesium terrain provider for elevation queries.
 *   • Add terrain texture/category data (water, forest, urban).
 *   • LOD: reduce octaves at high altitude.
 */

const DEG_TO_RAD        = Math.PI / 180;
const METERS_PER_DEG_LAT = 111_320;

// ── Quality presets ──────────────────────────────────────────────────

export type TerrainQuality = 'low' | 'medium' | 'high';

interface QualityPreset {
  readonly slices:  number;
  readonly columns: number;
  readonly octaves: number;
}

const QUALITY_PRESETS: Readonly<Record<TerrainQuality, QualityPreset>> = {
  low:    { slices:  8, columns: 16, octaves: 3 },
  medium: { slices: 16, columns: 32, octaves: 4 },
  high:   { slices: 24, columns: 48, octaves: 5 },
};

// ── Configuration ────────────────────────────────────────────────────

export interface TerrainConfig {
  /** Quality preset controlling grid resolution and noise detail. */
  readonly quality: TerrainQuality;
  /** Maximum forward viewing distance in metres. */
  readonly maxDistanceM: number;
  /** Minimum forward viewing distance in metres. */
  readonly minDistanceM: number;
  /** Mean terrain elevation above sea level in metres. */
  readonly baseElevationM: number;
  /** Terrain relief amplitude in metres (peak-to-base). */
  readonly reliefM: number;
  /** Noise spatial scale in metres (size of major features). */
  readonly noiseScaleM: number;
  /** Horizontal half-FOV in degrees (symmetric about heading). */
  readonly fovHalfDeg: number;
}

const DEFAULT_CONFIG: TerrainConfig = {
  quality:        'medium',
  maxDistanceM:   15_000,
  minDistanceM:   100,
  baseElevationM: 200,
  reliefM:        600,
  noiseScaleM:    3000,
  fovHalfDeg:     30,
};

// ═══════════════════════════════════════════════════════════════════════
//  NOISE PRIMITIVES — self-contained, no external dependencies
// ═══════════════════════════════════════════════════════════════════════

/**
 * Thomas Wang 2D integer hash → [0, 1].
 * Fast, deterministic, good distribution for procedural terrain.
 */
function hash2D(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** Hermite smoothstep  t² (3 − 2t)  for C¹-continuous interpolation. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 2D value noise with Hermite interpolation.
 * Deterministic: same (x, y) input always yields the same output.
 * @returns  Value in [0, 1].
 */
function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);

  const n00 = hash2D(ix,     iy);
  const n10 = hash2D(ix + 1, iy);
  const n01 = hash2D(ix,     iy + 1);
  const n11 = hash2D(ix + 1, iy + 1);

  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

/**
 * Fractal Brownian Motion — layered value noise for natural terrain.
 *
 * Each successive octave has half the amplitude and double the frequency,
 * producing self-similar detail at multiple scales.
 *
 * @returns  Value in [0, 1].
 */
function fbm(x: number, y: number, octaves: number): number {
  let value    = 0;
  let amp      = 1;
  let freq     = 1;
  let maxAmp   = 0;

  for (let i = 0; i < octaves; i++) {
    value  += valueNoise2D(x * freq, y * freq) * amp;
    maxAmp += amp;
    amp    *= 0.5;
    freq   *= 2;
  }

  return value / maxAmp;
}

// ═══════════════════════════════════════════════════════════════════════
//  TerrainEngine
// ═══════════════════════════════════════════════════════════════════════

export class TerrainEngine {
  // ── Grid dimensions (immutable after construction) ─────────────────
  private readonly _slices:  number;
  private readonly _columns: number;
  private readonly _octaves: number;

  // ── Pre-allocated buffers — NEVER re-created ───────────────────────
  private readonly _distances:     Float64Array;   // [slices]
  private readonly _lateralAngles: Float64Array;   // [columns]  (degrees)
  private readonly _lateralTans:   Float64Array;   // [columns]  tan(angle)
  private readonly _elevations:    Float64Array;   // [slices × columns]

  // ── Immutable config copy ──────────────────────────────────────────
  private readonly _config: TerrainConfig;

  // ── Dirty check — avoids redundant regeneration ────────────────────
  private _lastLat = NaN;
  private _lastLon = NaN;
  private _lastHdg = NaN;

  // ── Public read-only accessors ─────────────────────────────────────
  get slices():        number       { return this._slices; }
  get columns():       number       { return this._columns; }
  get distances():     Float64Array { return this._distances; }
  get lateralAngles(): Float64Array { return this._lateralAngles; }
  get elevations():    Float64Array { return this._elevations; }

  constructor(config?: Partial<TerrainConfig>) {
    const cfg: TerrainConfig = { ...DEFAULT_CONFIG, ...config };
    this._config  = cfg;

    const preset  = QUALITY_PRESETS[cfg.quality];
    this._slices  = preset.slices;
    this._columns = preset.columns;
    this._octaves = preset.octaves;

    // Allocate all buffers up-front
    this._distances     = new Float64Array(this._slices);
    this._lateralAngles = new Float64Array(this._columns);
    this._lateralTans   = new Float64Array(this._columns);
    this._elevations    = new Float64Array(this._slices * this._columns);

    this._initDistances();
    this._initLateralAngles();
  }

  // ── One-time initialisers ──────────────────────────────────────────

  /**
   * Pre-compute logarithmically-spaced forward distances.
   *
   * Logarithmic spacing gives more polygons near the aircraft where
   * perspective detail matters, and fewer at long range where terrain
   * is visually compressed.
   *
   *   distances[0]     = maxDistanceM   (farthest — drawn first)
   *   distances[N − 1] = minDistanceM   (nearest  — drawn last)
   */
  private _initDistances(): void {
    const { minDistanceM, maxDistanceM } = this._config;
    const logMin = Math.log(minDistanceM);
    const logMax = Math.log(maxDistanceM);
    const n      = this._slices;

    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      this._distances[i] = Math.exp(logMax - t * (logMax - logMin));
    }
  }

  /**
   * Pre-compute lateral angles and their tangents.
   * Symmetric about the centreline: [−fovHalfDeg … +fovHalfDeg].
   */
  private _initLateralAngles(): void {
    const halfFov = this._config.fovHalfDeg;
    const n       = this._columns;

    for (let j = 0; j < n; j++) {
      const angle = -halfFov + (2 * halfFov * j) / Math.max(1, n - 1);
      this._lateralAngles[j] = angle;
      this._lateralTans[j]   = Math.tan(angle * DEG_TO_RAD);
    }
  }

  // ── Per-frame update ───────────────────────────────────────────────

  /**
   * Regenerates the elevation grid for the current aircraft position.
   *
   * Called once per animation frame by ArtificialHorizon.draw().
   * Skips regeneration if position/heading haven't changed enough
   * (Δ < ~5.6 m or < 1° heading).
   *
   * ZERO ALLOCATION: writes only into the pre-allocated _elevations buffer.
   *
   * @param lat         Aircraft latitude  (decimal degrees)
   * @param lon         Aircraft longitude (decimal degrees)
   * @param headingDeg  Aircraft heading   (0 = North, clockwise)
   */
  update(lat: number, lon: number, headingDeg: number): void {
    // ── Dirty check ──────────────────────────────────────────────
    if (
      Math.abs(lat - this._lastLat)        < 5e-5 &&
      Math.abs(lon - this._lastLon)        < 5e-5 &&
      Math.abs(headingDeg - this._lastHdg) < 1
    ) {
      return;
    }
    this._lastLat = lat;
    this._lastLon = lon;
    this._lastHdg = headingDeg;

    // ── Heading rotation (world → aircraft-relative) ─────────────
    const hdgRad = headingDeg * DEG_TO_RAD;
    const cosH   = Math.cos(hdgRad);
    const sinH   = Math.sin(hdgRad);

    // ── Metres ↔ degrees conversion ──────────────────────────────
    const cosLat     = Math.cos(lat * DEG_TO_RAD);
    const mPerDegLon = METERS_PER_DEG_LAT * cosLat;

    // ── Noise parameters ─────────────────────────────────────────
    const { baseElevationM, reliefM, noiseScaleM } = this._config;
    const invScale = 1 / noiseScaleM;
    const octaves  = this._octaves;

    const slices   = this._slices;
    const columns  = this._columns;

    for (let s = 0; s < slices; s++) {
      const d   = this._distances[s];
      const row = s * columns;

      for (let c = 0; c < columns; c++) {
        // Lateral offset at this distance using pre-computed tangent
        const lateralM = d * this._lateralTans[c];

        // Rotate forward + lateral by heading → North/East offsets
        const northM = d * cosH - lateralM * sinH;
        const eastM  = d * sinH + lateralM * cosH;

        // World position sampling
        const sLat = lat + northM / METERS_PER_DEG_LAT;
        const sLon = lon + eastM  / mPerDegLon;

        // Convert to noise-space (terrain units)
        const nx = sLon * mPerDegLon * invScale;
        const ny = sLat * METERS_PER_DEG_LAT * invScale;

        // Terrain elevation via FBM
        this._elevations[row + c] = baseElevationM + fbm(nx, ny, octaves) * reliefM;
      }
    }
  }

  /**
   * Read elevation for a specific grid cell.
   * @returns Elevation above sea level in metres.
   */
  getElevation(slice: number, col: number): number {
    return this._elevations[slice * this._columns + col];
  }

  /**
   * Force full recalculation on the next update() call.
   * Useful after changing config or switching terrain data source.
   */
  invalidate(): void {
    this._lastLat = NaN;
    this._lastLon = NaN;
    this._lastHdg = NaN;
  }
}
