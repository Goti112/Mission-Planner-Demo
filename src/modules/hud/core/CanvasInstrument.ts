/**
 * CanvasInstrument.ts
 *
 * Clase base abstracta para todos los instrumentos que usan Canvas 2D.
 *
 * Responsabilidades:
 *   - Gestión del canvas y contexto 2D
 *   - DPI-aware resize (devicePixelRatio)
 *   - Limpieza del frame
 *   - Acceso al tema de colores
 *
 * Cada instrumento hereda de esta clase e implementa draw().
 * El draw() es llamado desde el rAF loop de useHUDLoop — no desde React.
 *
 * Invariante: draw() no tiene efectos secundarios fuera del canvas.
 * Invariante: ningún instrumento llama a requestAnimationFrame directamente.
 */

import { DEFAULT_HUD_THEME } from './HUDTheme';
import type { HUDTheme } from './HUDTheme';
import type { FlightTelemetry } from '../../telemetry';

export abstract class CanvasInstrument {
  protected canvas: HTMLCanvasElement;
  protected ctx:    CanvasRenderingContext2D;
  protected theme:  HUDTheme;
  protected dpr:    number;

  /** Dimensiones lógicas (CSS pixels). */
  protected width:  number = 0;
  protected height: number = 0;

  constructor(canvas: HTMLCanvasElement, theme: HUDTheme = DEFAULT_HUD_THEME) {
    this.canvas = canvas;
    this.theme  = theme;
    this.dpr    = window.devicePixelRatio || 1;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CanvasInstrument: no se pudo obtener contexto 2D');
    this.ctx = ctx;
  }

  /**
   * Adapta el canvas a las nuevas dimensiones, teniendo en cuenta el DPR.
   * Debe llamarse desde el ResizeObserver del contenedor (useHUDResize).
   *
   * @param width   Ancho en CSS pixels.
   * @param height  Alto en CSS pixels.
   */
  resize(width: number, height: number): void {
    this.dpr    = window.devicePixelRatio || 1;
    this.width  = width;
    this.height = height;

    // Canvas físico: DPR × dimensión CSS (sharp en pantallas Retina).
    this.canvas.width  = Math.round(width  * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);

    // NOTE: canvas.style.width/height are intentionally NOT set here.
    // Setting px inline-styles would lock the canvas to a fixed size and
    // prevent CSS `width: 100%; height: 100%` from tracking the grid cell.
    // The ResizeObserver in useHUDResize fires on CSS contentRect changes —
    // if inline px styles override the percentages, the observer never fires
    // again on parent resize and the canvas stays frozen at the old size.
    // DPI sharpness is guaranteed by canvas.width = cssWidth * dpr above.

    // Escalar el contexto para que el código de dibujo use CSS px.
    this.ctx.scale(this.dpr, this.dpr);
  }

  /**
   * Limpia el canvas completo.
   * Llamar al inicio de cada draw().
   */
  protected clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Actualiza el tema del instrumento.
   * Útil para cambio de tema en tiempo de ejecución.
   */
  setTheme(theme: HUDTheme): void {
    this.theme = theme;
  }

  /**
   * Draws the instrument for one animation frame.
   *
   * CONTRACT — ZERO ALLOCATION ZONE:
   *   • draw() is called at 60 Hz inside the global rAF loop.
   *   • It MUST NOT create heap objects (no {}, [], template literals).
   *   • All layout constants must be pre-computed in resize() and stored
   *     as class fields.
   *   • Font strings must be pre-built in resize() (not in draw()).
   *   • Use String(Math.round(n)) not n.toFixed(0) — V8 interns integers.
   *
   * @param data  Latest smoothed FlightTelemetry snapshot from TelemetryManager.
   *              Same reference every frame (updated between frames, not during).
   */
  abstract draw(data: Readonly<FlightTelemetry>): void;

  /**
   * Libera recursos. Llamar al desmontar el componente.
   */
  destroy(): void {
    // Subclases pueden sobreescribir para limpiar recursos adicionales.
  }
}
