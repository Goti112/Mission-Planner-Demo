/**
 * ControlSurfacesInstrument.ts  —  Fusion C+D design
 *
 * Five columns, one per control surface.
 * Each column has three stacked zones:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  ZONE 1 (50%)  Close-up animated icon   │
 *   ├─────────────────────────────────────────┤
 *   │  ZONE 2 (26%)  Mini EFIS arc            │
 *   ├─────────────────────────────────────────┤
 *   │  ZONE 3 (24%)  Bar + label + value      │
 *   └─────────────────────────────────────────┘
 *
 * Pattern: extends CanvasInstrument.
 *   resize()  — pre-compute all geometry (called once on container resize)
 *   draw(tel) — zero-alloc canvas render (called every rAF frame ≈ 60 fps)
 *
 * Drawing space: CSS pixels (ctx already scaled by DPR via CanvasInstrument.resize()).
 */

import { CanvasInstrument }     from '../core/CanvasInstrument';
import type { HUDTheme }        from '../core/HUDTheme';
import type { FlightTelemetry } from '../../telemetry';
import type { ControlPanelResolvedLayout } from '../pfd/controlSurfacesPanelLayout';

// ── Surface palette ───────────────────────────────────────────────────────

const C_AIL  = '#22d3ee';   // cyan
const C_ELV  = '#f97316';   // orange
const C_RDR  = '#a78bfa';   // violet
const C_THR  = '#4ade80';   // green
const C_FLP  = '#fbbf24';   // yellow
const C_STRUCT = '#1a2a40'; // structural fill
const C_EDGE   = '#334155'; // structural edge

// ── Surface descriptor ────────────────────────────────────────────────────

interface SurfDef {
  label: string;
  color: string;
  bidir: boolean;
}

const SURFS: readonly SurfDef[] = [
  { label: 'AIL',   color: C_AIL,  bidir: true  },
  { label: 'ELV',   color: C_ELV,  bidir: true  },
  { label: 'RDR',   color: C_RDR,  bidir: true  },
  { label: 'THR',   color: C_THR,  bidir: false },
  { label: 'FLAPS', color: C_FLP,  bidir: false },
];

// ─────────────────────────────────────────────────────────────────────────
// ControlSurfacesInstrument
// ─────────────────────────────────────────────────────────────────────────

export class ControlSurfacesInstrument extends CanvasInstrument {

  // ── Layout ────────────────────────────────────────────────────────────────

  private _layout: ControlPanelResolvedLayout = 'horizontal';

  setLayout(layout: ControlPanelResolvedLayout): void {
    if (this._layout !== layout) {
      this._layout = layout;
      // Trigger a resize recalculation on next frame via forcing resize
      this.resize(this.width, this.height);
    }
  }

  // ── Geometry cache (resize → draw) ────────────────────────────────────

  private _cw     = 0;   // column width  = W / 5
  private _iconH  = 0;   // zone-1 height = H * 0.50
  private _arcH   = 0;   // zone-2 height = H * 0.26
  private _barH   = 0;   // zone-3 height = H * 0.24

  private _arcY   = 0;   // top of zone-2
  private _barY   = 0;   // top of zone-3

  private _arcCY  = 0;   // arc circle center Y
  private _arcR   = 0;   // arc circle radius

  private _barTrackH = 0;
  private _barTrackY = 0;
  private _barPad    = 0;
  private _lblY      = 0;
  private _valY      = 0;

  private _fontLbl = '';
  private _fontVal = '';

  private _iconCY = 0;
  private _ws     = 0;   // wing half-span for AIL icon
  private _thrR   = 0;   // throttle engine radius

  constructor(canvas: HTMLCanvasElement, theme?: HUDTheme) {
    super(canvas, theme);
  }

  // ── resize ────────────────────────────────────────────────────────────

  override resize(cssW: number, cssH: number): void {
    super.resize(cssW, cssH);

    const W = this.width;
    const H = this.height;

    const columnCount = this._layout === 'vertical' ? 1 : this._layout === 'grid' ? 3 : 5;
    this._cw    = W / columnCount;
    this._iconH = H * 0.50;
    this._arcH  = H * 0.26;
    this._barH  = H * 0.24;

    this._arcY  = this._iconH;
    this._barY  = this._iconH + this._arcH;

    this._arcR  = this._arcH * 0.32;
    this._arcCY = this._arcY + this._arcH * 0.52;

    this._barTrackH = Math.max(6, this._barH * 0.24);
    this._barTrackY = this._barY + this._barH * 0.10;
    this._barPad    = this._cw * 0.10;
    this._lblY      = this._barY + this._barH * 0.56;
    this._valY      = this._barY + this._barH * 0.82;

    this._iconCY = this._iconH * 0.50;
    this._ws     = this._cw * 0.40;
    this._thrR   = Math.min(this._cw * 0.27, this._iconH * 0.42);

    const lblPx = Math.max(9.9,  Math.round(this._cw * 0.1265));
    const valPx = Math.max(12.1, Math.round(this._cw * 0.1485));
    this._fontLbl = `bold ${lblPx}px monospace`;
    this._fontVal = `bold ${valPx}px monospace`;
  }

  // ── Cell geometry ──────────────────────────────────────────────────────

  private _getCellRect(index: number): { x: number; y: number; w: number; h: number } {
    const W = this.width;
    const H = this.height;

    if (this._layout === 'vertical') {
      const h = H / 5;
      return { x: 0, y: index * h, w: W, h };
    }

    if (this._layout === 'grid') {
      const colW = W / 3;
      const rowH = H / 2;
      if (index < 3) {
        return { x: index * colW, y: 0, w: colW, h: rowH };
      }
      // Last row: 2 items centered
      const offsetX = (W - 2 * colW) / 2;
      return { x: offsetX + (index - 3) * colW, y: rowH, w: colW, h: rowH };
    }

    // horizontal (default)
    const w = W / 5;
    return { x: index * w, y: 0, w, h: H };
  }

  // ── draw ─────────────────────────────────────────────────────────────

  draw(tel: Readonly<FlightTelemetry>): void {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const cs = tel.controlSurfaces;

    ctx.clearRect(0, 0, W, H);

    const pcts = [
      cs.aileronPct, cs.elevatorPct, cs.rudderPct, cs.throttlePct, cs.flapsPct,
    ] as const;

    for (let i = 0; i < 5; i++) {
      const cell = this._getCellRect(i);
      ctx.save();
      ctx.translate(cell.x, cell.y);
      this._drawSurfaceCell(ctx, cell.w, cell.h, i, pcts[i], SURFS[i]);
      ctx.restore();
    }

    // Cell separators
    ctx.strokeStyle = '#0f1e30';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const cell     = this._getCellRect(i);
      const prevCell = this._getCellRect(i - 1);
      // Draw separator only when the cell starts a new column or row
      if (cell.x !== prevCell.x) {
        ctx.beginPath();
        ctx.moveTo(cell.x, cell.y + 2);
        ctx.lineTo(cell.x, cell.y + cell.h - 2);
        ctx.stroke();
      } else if (cell.y !== prevCell.y) {
        ctx.beginPath();
        ctx.moveTo(cell.x + 2,          cell.y);
        ctx.lineTo(cell.x + cell.w - 2, cell.y);
        ctx.stroke();
      }
    }
  }

  // ── Cell drawing ──────────────────────────────────────────────────────

  private _drawSurfaceCell(
    ctx: CanvasRenderingContext2D,
    cellW: number,
    cellH: number,
    index: number,
    pct: number,
    def: SurfDef,
  ): void {
    // Save all geometry that the drawing helpers read from `this`
    const saved = {
      _cw: this._cw, _iconH: this._iconH, _arcH: this._arcH, _barH: this._barH,
      _arcY: this._arcY, _barY: this._barY, _arcCY: this._arcCY, _arcR: this._arcR,
      _barTrackH: this._barTrackH, _barTrackY: this._barTrackY, _barPad: this._barPad,
      _lblY: this._lblY, _valY: this._valY, _iconCY: this._iconCY,
      _ws: this._ws, _thrR: this._thrR, _fontLbl: this._fontLbl, _fontVal: this._fontVal,
    };

    // Recompute geometry for the cell dimensions
    this._cw         = cellW;
    this._iconH      = cellH * 0.50;
    this._arcH       = cellH * 0.26;
    this._barH       = cellH * 0.24;
    this._arcY       = this._iconH;
    this._barY       = this._iconH + this._arcH;
    this._arcR       = this._arcH * 0.32;
    this._arcCY      = this._arcY + this._arcH * 0.52;
    this._barTrackH  = Math.max(6, this._barH * 0.24);
    this._barTrackY  = this._barY + this._barH * 0.10;
    this._barPad     = cellW * 0.10;
    this._lblY       = this._barY + this._barH * 0.56;
    this._valY       = this._barY + this._barH * 0.82;
    this._iconCY     = this._iconH * 0.50;
    this._ws         = cellW * 0.40;
    this._thrR       = Math.min(cellW * 0.27, this._iconH * 0.42);
    const lblPx      = Math.max(9.9,  Math.round(cellW * 0.1265));
    const valPx      = Math.max(12.1, Math.round(cellW * 0.1485));
    this._fontLbl    = `bold ${lblPx}px monospace`;
    this._fontVal    = `bold ${valPx}px monospace`;

    const cx = cellW / 2;

    // Zone backgrounds
    ctx.fillStyle = '#0a1220';
    ctx.fillRect(0, this._arcY, cellW, this._arcH);
    ctx.fillStyle = '#060d18';
    ctx.fillRect(0, this._barY, cellW, this._barH);

    // Zone dividers
    ctx.strokeStyle = '#1e293b50';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(2, this._arcY); ctx.lineTo(cellW - 2, this._arcY);
    ctx.moveTo(2, this._barY); ctx.lineTo(cellW - 2, this._barY);
    ctx.stroke();

    // Column bg glow
    const bg = ctx.createRadialGradient(cx, this._iconCY, 0, cx, this._iconCY, cellW * 0.7);
    bg.addColorStop(0, def.color + '0d');
    bg.addColorStop(1, 'transparent');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cellW, this._iconH);

    // Zone 1: icon
    switch (index) {
      case 0: this._drawAilIcon(ctx, cx, pct); break;
      case 1: this._drawElvIcon(ctx, cx, pct); break;
      case 2: this._drawRdrIcon(ctx, cx, pct); break;
      case 3: this._drawThrIcon(ctx, cx, pct); break;
      case 4: this._drawFlpIcon(ctx, cx, pct); break;
    }

    // Zone 2: mini EFIS arc
    this._drawArc(ctx, cx, pct, def);

    // Zone 3: bar + label + value (col=0 since we are in cell-local coords)
    this._drawBar(ctx, 0, cx, pct, def);

    // Restore geometry
    Object.assign(this, saved);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Zone 1 — close-up icons
  // ══════════════════════════════════════════════════════════════════════

  /** AIL — front-view wing dihedral, glowing tips deflect asymmetrically */
  private _drawAilIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy   = this._iconCY;
    const ws   = this._ws;
    const defl = (pct / 100) * ws * 0.38;

    ctx.save();
    ctx.translate(cx, cy);

    // Wing fill panels
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = C_STRUCT;
    ctx.beginPath();
    ctx.moveTo(-ws, -7 - defl); ctx.lineTo(-5, -2); ctx.lineTo(-5, 4); ctx.lineTo(-ws, -1 - defl);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ws, -7 + defl); ctx.lineTo(5, -2); ctx.lineTo(5, 4); ctx.lineTo(ws, -1 + defl);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Wing leading edge
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-ws, -7 - defl); ctx.lineTo(-5, -2); ctx.lineTo(5, -2); ctx.lineTo(ws, -7 + defl);
    ctx.stroke();

    // Glowing aileron tips
    ctx.shadowColor = C_AIL; ctx.shadowBlur = 16;
    ctx.strokeStyle = C_AIL; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-ws,        -7 - defl);
    ctx.lineTo(-ws * 0.60, -5 - defl * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ws,        -7 + defl);
    ctx.lineTo(ws * 0.60, -5 + defl * 0.6);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fuselage dot
    ctx.fillStyle = '#243347';
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();
  }

  /** ELV — side-view H-stab, elevator rotates around hinge */
  private _drawElvIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy  = this._iconCY + 2;
    const ang = (pct / 100) * 0.52;

    ctx.save();
    ctx.translate(cx, cy);

    // Aft fuselage block
    ctx.fillStyle = C_STRUCT;
    ctx.beginPath();
    ctx.moveTo(-20, -5); ctx.lineTo(8, -5); ctx.lineTo(8, 5); ctx.lineTo(-20, 5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 0.8; ctx.stroke();

    // Fixed H-stab (upper and lower)
    ctx.fillStyle = '#243347';
    ctx.beginPath();
    ctx.moveTo(2, -5); ctx.lineTo(11, -5); ctx.lineTo(11, -13); ctx.lineTo(4, -11);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2,  5); ctx.lineTo(11,  5); ctx.lineTo(11,  13); ctx.lineTo(4,  11);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3d5470'; ctx.lineWidth = 0.8; ctx.stroke();

    // Deflection guide arcs (faint)
    ctx.strokeStyle = C_ELV + '1a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(8, -9, 12, -Math.PI * 0.55, -Math.PI * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.arc(8,  9, 12,  Math.PI * 0.05,  Math.PI * 0.55); ctx.stroke();

    // Elevator halves
    ctx.shadowColor = C_ELV; ctx.shadowBlur = 18;
    ctx.fillStyle = C_ELV + 'bb';
    ctx.save(); ctx.translate(8, -9); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.lineTo(8, -5); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(8,  9); ctx.rotate(-ang);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.lineTo(8,  5); ctx.lineTo(0,  4); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  /** RDR — top-down view, V-fin + rudder rotates */
  private _drawRdrIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy  = this._iconCY;
    const ang = (pct / 100) * 0.52;

    ctx.save();
    ctx.translate(cx, cy);

    // Fuselage (top-down ellipse)
    ctx.fillStyle = C_STRUCT;
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 20, 0, 0, Math.PI * 2); ctx.stroke();

    // Fixed V-fin base
    ctx.fillStyle = '#243347';
    ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(2, 6); ctx.lineTo(4, 20); ctx.lineTo(-4, 20); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3d5470'; ctx.lineWidth = 0.8; ctx.stroke();

    // Deflection guide (faint arc)
    ctx.strokeStyle = C_RDR + '1a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 15, 10, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke();

    // Rudder
    ctx.shadowColor = C_RDR; ctx.shadowBlur = 18;
    ctx.fillStyle = C_RDR + 'bb';
    ctx.save(); ctx.translate(0, 14); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(2, -5); ctx.lineTo(3, 6); ctx.lineTo(-2, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  /** THR — front-view engine with throttle arc + prop blades */
  private _drawThrIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy = this._iconCY;
    const r  = this._thrR;

    ctx.save();
    ctx.translate(cx, cy);

    // Cowl
    const cowl = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
    cowl.addColorStop(0, '#1a2a40');
    cowl.addColorStop(1, '#060d18');
    ctx.fillStyle = cowl;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#243347'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

    // Throttle arc track
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.74, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();

    // Throttle arc fill
    ctx.shadowColor = C_THR; ctx.shadowBlur = 14;
    ctx.strokeStyle = C_THR; ctx.lineWidth = 5;
    const sweep = (pct / 100) * Math.PI * 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.74, Math.PI * 0.75, Math.PI * 0.75 + sweep); ctx.stroke();
    ctx.shadowBlur = 0;

    // Prop blades (3-blade static)
    ctx.lineCap = 'round';
    [15, 135, 255].forEach(deg => {
      const a = deg * Math.PI / 180;
      ctx.strokeStyle = C_THR + '50'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      ctx.lineTo(Math.cos(a) * r * 0.50, Math.sin(a) * r * 0.50);
      ctx.stroke();
    });

    // Spinner center
    ctx.fillStyle = C_THR + '30';
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C_THR;
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  /** FLAPS — top-down wing section, trailing-edge flap deploys outward */
  private _drawFlpIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy   = this._iconCY - 4;
    const depl = pct / 100;

    ctx.save();
    ctx.translate(cx, cy);

    // Wing section
    ctx.fillStyle = C_STRUCT;
    ctx.beginPath();
    ctx.moveTo(-20, -14); ctx.lineTo(20, -12); ctx.lineTo(18, 8); ctx.lineTo(-20, 8);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 1; ctx.stroke();

    // Hinge line (dashed)
    ctx.strokeStyle = C_FLP + '40'; ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(-19, 8); ctx.lineTo(17, 8); ctx.stroke();
    ctx.setLineDash([]);

    // Flap panel
    const fh = depl * 16 + 5;
    ctx.shadowColor = C_FLP; ctx.shadowBlur = depl * 16 + 4;
    ctx.fillStyle   = C_FLP + (depl > 0.05 ? 'bb' : '33');
    ctx.beginPath();
    ctx.moveTo(-19, 8); ctx.lineTo(17, 8); ctx.lineTo(17, 8 + fh); ctx.lineTo(-19, 8 + fh);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = C_FLP; ctx.lineWidth = 1.5;
    ctx.strokeRect(-19, 8, 36, fh);

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════
  // Zone 2 — mini EFIS arc
  // ══════════════════════════════════════════════════════════════════════

  private _drawArc(
    ctx: CanvasRenderingContext2D,
    cx: number,
    pct: number,
    def: SurfDef,
  ): void {
    const cy = this._arcCY;
    const r  = this._arcR;
    const startAng   = def.bidir ? Math.PI * 0.65 : Math.PI * 0.75;
    const totalSweep = def.bidir ? Math.PI * 1.70 : Math.PI * 1.50;

    // Track
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, startAng, startAng + totalSweep); ctx.stroke();

    // Value arc
    ctx.shadowColor = def.color; ctx.shadowBlur = 8;
    ctx.strokeStyle = def.color; ctx.lineWidth = 4;

    if (def.bidir) {
      const mid = startAng + totalSweep / 2;
      const ms  = (pct / 100) * (totalSweep / 2);
      ctx.beginPath();
      if (pct >= 0) ctx.arc(cx, cy, r, mid,      mid + ms);
      else          ctx.arc(cx, cy, r, mid + ms,  mid);
      ctx.stroke();

      // 12-o'clock centre tick
      ctx.shadowBlur = 0;
      ctx.strokeStyle = def.color + '30'; ctx.lineWidth = 1;
      const tx1 = cx + Math.cos(mid) * (r - 5);
      const ty1 = cy + Math.sin(mid) * (r - 5);
      const tx2 = cx + Math.cos(mid) * (r + 1);
      const ty2 = cy + Math.sin(mid) * (r + 1);
      ctx.beginPath(); ctx.moveTo(tx1, ty1); ctx.lineTo(tx2, ty2); ctx.stroke();
    } else {
      const ms = (pct / 100) * totalSweep;
      ctx.beginPath(); ctx.arc(cx, cy, r, startAng, startAng + ms); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Centre dot
    ctx.fillStyle = def.color + '40';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  // ══════════════════════════════════════════════════════════════════════
  // Zone 3 — bar + label + value
  // ══════════════════════════════════════════════════════════════════════

  private _drawBar(
    ctx: CanvasRenderingContext2D,
    col: number,
    cx: number,
    pct: number,
    def: SurfDef,
  ): void {
    const bx  = col * this._cw + this._barPad;
    const bw  = this._cw - this._barPad * 2;
    const by  = this._barTrackY;
    const bh  = this._barTrackH;

    // Track
    ctx.fillStyle = '#0d1a28';
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void })
      .roundRect(bx, by, bw, bh, 3);
    ctx.fill();

    // Fill
    ctx.fillStyle = def.color;
    if (def.bidir) {
      const hw = bw / 2;
      const fw = Math.abs(pct) / 100 * hw;
      if (pct >= 0) {
        ctx.beginPath();
        (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void })
          .roundRect(bx + hw, by, fw, bh, [0, 3, 3, 0]);
        ctx.fill();
      } else {
        ctx.beginPath();
        (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void })
          .roundRect(bx + hw - fw, by, fw, bh, [3, 0, 0, 3]);
        ctx.fill();
      }
      // Centre tick
      ctx.strokeStyle = '#33415540'; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(bx + hw, by + 1); ctx.lineTo(bx + hw, by + bh - 1);
      ctx.stroke();
    } else {
      const fw = (pct / 100) * bw;
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void })
        .roundRect(bx, by, fw, bh, [3, 0, 0, 3]);
      ctx.fill();
    }

    // Label
    ctx.fillStyle    = def.color + 'aa';
    ctx.font         = this._fontLbl;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(def.label, cx, this._lblY);

    // Value
    ctx.fillStyle = '#e2e8f0';
    ctx.font      = this._fontVal;
    ctx.fillText(`${Math.round(pct)}%`, cx, this._valY);
  }
}
