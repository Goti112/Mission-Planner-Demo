/**
 * ControlSurfaceInstrument.ts  —  Single-column variant
 *
 * Draws exactly ONE control surface column at full canvas width.
 * Extracted from ControlSurfacesInstrument (5-column version).
 *
 * Three stacked zones:
 *   ┌──────────────────┐
 *   │ ZONE 1 (50%)  icon│
 *   ├──────────────────┤
 *   │ ZONE 2 (26%)  arc │
 *   ├──────────────────┤
 *   │ ZONE 3 (24%)  bar │
 *   └──────────────────┘
 *
 * Pattern: extends CanvasInstrument.
 *   resize()  — pre-compute geometry (called on container resize)
 *   draw(tel) — zero-alloc canvas render (called every rAF frame)
 */

import { CanvasInstrument }     from '../core/CanvasInstrument';
import type { HUDTheme }        from '../core/HUDTheme';
import type { FlightTelemetry } from '../../telemetry';
import type { SurfaceId, ZoneFlags } from '../../../shared/contexts/DetachedSurfacesContext';
export type { SurfaceId, ZoneFlags } from '../../../shared/contexts/DetachedSurfacesContext';

// ── Palette ────────────────────────────────────────────────────────────────
const COLORS: Record<SurfaceId, string> = {
  ail: '#22d3ee',
  elv: '#f97316',
  rdr: '#a78bfa',
  thr: '#4ade80',
  flp: '#fbbf24',
};

const LABELS: Record<SurfaceId, string> = {
  ail: 'AIL',
  elv: 'ELV',
  rdr: 'RDR',
  thr: 'THR',
  flp: 'FLAPS',
};

const BIDIR: Record<SurfaceId, boolean> = {
  ail: true,
  elv: true,
  rdr: true,
  thr: false,
  flp: false,
};

const C_STRUCT = '#1a2a40';
const C_EDGE   = '#334155';

// ── Instrument ─────────────────────────────────────────────────────────────

export class ControlSurfaceInstrument extends CanvasInstrument {
  private readonly _surface: SurfaceId;
  private _zones: ZoneFlags = { icon: true, arc: true, val: true };

  // Geometry cache
  private _iconH  = 0;
  private _arcH   = 0;
  private _barH   = 0;
  private _arcY   = 0;
  private _barY   = 0;
  private _arcCY  = 0;
  private _arcR   = 0;
  private _fontLbl   = '';
  private _fontVal   = '';
  private _iconCY    = 0;
  private _ws        = 0;
  private _thrR      = 0;

  constructor(canvas: HTMLCanvasElement, surface: SurfaceId, theme?: HUDTheme) {
    super(canvas, theme);
    this._surface = surface;
  }

  setZones(zones: ZoneFlags): void {
    this._zones = zones;
  }

  // ── resize ────────────────────────────────────────────────────────────

  override resize(cssW: number, cssH: number): void {
    super.resize(cssW, cssH);

    const W = this.width;
    const H = this.height;

    // Compute visible zone heights based on flags
    const { icon, arc, val } = this._zones;
    const visibleCount = (icon ? 1 : 0) + (arc ? 1 : 0) + (val ? 1 : 0);
    if (visibleCount === 0) return;

    // Use full width — single column
    const iconFrac = icon ? 0.50 : 0;
    const arcFrac  = arc  ? 0.26 : 0;
    // Value bar was removed from the design; value is now drawn inside the arc.
    const barFrac  = 0;
    const total = iconFrac + arcFrac + barFrac || 1;

    this._iconH = H * (iconFrac / total);
    this._arcH  = H * (arcFrac / total);
    this._barH  = H * (barFrac / total);

    this._arcY  = this._iconH;
    this._barY  = this._iconH + this._arcH;

    this._arcR  = Math.min(W * 0.25, this._arcH * 0.45);
    this._arcCY = this._arcY + this._arcH * 0.50;

    this._iconCY = this._iconH * 0.50;
    this._ws     = W * 0.40;
    this._thrR   = Math.min(W * 0.27, this._iconH * 0.34);

    const lblPx = Math.max(8.8, Math.round(this._arcR * 0.55));
    const valPx = Math.max(11,  Math.round(this._arcR * 0.715));
    this._fontLbl = `bold ${lblPx}px monospace`;
    this._fontVal = `bold ${valPx}px monospace`;
  }

  // ── draw ─────────────────────────────────────────────────────────────

  draw(tel: Readonly<FlightTelemetry>): void {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const cs = tel.controlSurfaces;

    ctx.clearRect(0, 0, W, H);

    const { icon, arc, val } = this._zones;
    const surface = this._surface;
    const color = COLORS[surface];
    const bidir = BIDIR[surface];

    const pctMap: Record<SurfaceId, number> = {
      ail: cs.aileronPct,
      elv: cs.elevatorPct,
      rdr: cs.rudderPct,
      thr: cs.throttlePct,
      flp: cs.flapsPct,
    };
    const pct = pctMap[surface];

    const cx = W * 0.5;

    // Zone backgrounds
    if (arc) {
      ctx.fillStyle = '#0a1220';
      ctx.fillRect(0, this._arcY, W, this._arcH);
    }
    if (val) {
      ctx.fillStyle = '#060d18';
      ctx.fillRect(0, this._barY, W, this._barH);
    }

    // Zone dividers
    if (arc || val) {
      ctx.strokeStyle = '#1e293b50';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      if (arc) { ctx.moveTo(6, this._arcY); ctx.lineTo(W - 6, this._arcY); }
      if (val) { ctx.moveTo(6, this._barY); ctx.lineTo(W - 6, this._barY); }
      ctx.stroke();
    }

    // Column bg glow in icon zone
    if (icon) {
      const bg = ctx.createRadialGradient(cx, this._iconCY, 0, cx, this._iconCY, W * 0.7);
      bg.addColorStop(0, color + '0d');
      bg.addColorStop(1, 'transparent');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, this._iconH);

      switch (surface) {
        case 'ail': this._drawAilIcon(ctx, cx, pct); break;
        case 'elv': this._drawElvIcon(ctx, cx, pct); break;
        case 'rdr': this._drawRdrIcon(ctx, cx, pct); break;
        case 'thr': this._drawThrIcon(ctx, cx, pct); break;
        case 'flp': this._drawFlpIcon(ctx, cx, pct); break;
      }
    }

    if (arc) {
      this._drawArc(ctx, cx, pct, color, bidir);
    }

    void val;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Zone 1 — close-up icons
  // ══════════════════════════════════════════════════════════════════════

  private _drawAilIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy   = this._iconCY;
    const ws   = this._ws;
    const defl = (pct / 100) * ws * 0.38;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.globalAlpha = 0.30;
    ctx.fillStyle = C_STRUCT;
    ctx.beginPath();
    ctx.moveTo(-ws, -7 - defl); ctx.lineTo(-5, -2); ctx.lineTo(-5, 4); ctx.lineTo(-ws, -1 - defl);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ws, -7 + defl); ctx.lineTo(5, -2); ctx.lineTo(5, 4); ctx.lineTo(ws, -1 + defl);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-ws, -7 - defl); ctx.lineTo(-5, -2); ctx.lineTo(5, -2); ctx.lineTo(ws, -7 + defl);
    ctx.stroke();

    const C_AIL = COLORS.ail;
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

    ctx.fillStyle = '#243347';
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();
  }

  private _drawElvIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy  = this._iconCY + 2;
    const ang = (pct / 100) * 0.52;
    const C_ELV = COLORS.elv;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = C_STRUCT;
    ctx.beginPath();
    ctx.moveTo(-20, -5); ctx.lineTo(8, -5); ctx.lineTo(8, 5); ctx.lineTo(-20, 5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 0.8; ctx.stroke();

    ctx.fillStyle = '#243347';
    ctx.beginPath();
    ctx.moveTo(2, -5); ctx.lineTo(11, -5); ctx.lineTo(11, -13); ctx.lineTo(4, -11);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2,  5); ctx.lineTo(11,  5); ctx.lineTo(11,  13); ctx.lineTo(4,  11);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3d5470'; ctx.lineWidth = 0.8; ctx.stroke();

    ctx.strokeStyle = C_ELV + '1a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(8, -9, 12, -Math.PI * 0.55, -Math.PI * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.arc(8,  9, 12,  Math.PI * 0.05,  Math.PI * 0.55); ctx.stroke();

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

  private _drawRdrIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy  = this._iconCY;
    const ang = (pct / 100) * 0.52;
    const C_RDR = COLORS.rdr;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = C_STRUCT;
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 20, 0, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = '#243347';
    ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(2, 6); ctx.lineTo(4, 20); ctx.lineTo(-4, 20); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3d5470'; ctx.lineWidth = 0.8; ctx.stroke();

    ctx.strokeStyle = C_RDR + '1a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 15, 10, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke();

    ctx.shadowColor = C_RDR; ctx.shadowBlur = 18;
    ctx.fillStyle = C_RDR + 'bb';
    ctx.save(); ctx.translate(0, 14); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(2, -5); ctx.lineTo(3, 6); ctx.lineTo(-2, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  private _drawThrIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy = this._iconCY;
    const r  = this._thrR;
    const C_THR = COLORS.thr;

    ctx.save();
    ctx.translate(cx, cy);

    const cowl = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
    cowl.addColorStop(0, '#1a2a40');
    cowl.addColorStop(1, '#060d18');
    ctx.fillStyle = cowl;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#243347'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.74, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();

    ctx.shadowColor = C_THR; ctx.shadowBlur = 14;
    ctx.strokeStyle = C_THR; ctx.lineWidth = 5;
    const sweep = (pct / 100) * Math.PI * 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.74, Math.PI * 0.75, Math.PI * 0.75 + sweep); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.lineCap = 'round';
    [15, 135, 255].forEach(deg => {
      const a = deg * Math.PI / 180;
      ctx.strokeStyle = C_THR + '50'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      ctx.lineTo(Math.cos(a) * r * 0.50, Math.sin(a) * r * 0.50);
      ctx.stroke();
    });

    ctx.fillStyle = C_THR + '30';
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C_THR;
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  private _drawFlpIcon(ctx: CanvasRenderingContext2D, cx: number, pct: number): void {
    const cy   = this._iconCY - 4;
    const depl = pct / 100;
    const C_FLP = COLORS.flp;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = C_STRUCT;
    ctx.beginPath();
    ctx.moveTo(-20, -14); ctx.lineTo(20, -12); ctx.lineTo(18, 8); ctx.lineTo(-20, 8);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C_EDGE; ctx.lineWidth = 1; ctx.stroke();

    ctx.strokeStyle = C_FLP + '40'; ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(-19, 8); ctx.lineTo(17, 8); ctx.stroke();
    ctx.setLineDash([]);

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
    color: string,
    bidir: boolean,
  ): void {
    const cy = this._arcCY;
    const r  = this._arcR;
    const startAng   = bidir ? Math.PI * 0.65 : Math.PI * 0.75;
    const totalSweep = bidir ? Math.PI * 1.70 : Math.PI * 1.50;

    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, startAng, startAng + totalSweep); ctx.stroke();

    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.strokeStyle = color; ctx.lineWidth = 4;

    if (bidir) {
      const mid = startAng + totalSweep / 2;
      const ms  = (pct / 100) * (totalSweep / 2);
      ctx.beginPath();
      if (pct >= 0) ctx.arc(cx, cy, r, mid,      mid + ms);
      else          ctx.arc(cx, cy, r, mid + ms,  mid);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = color + '30'; ctx.lineWidth = 1;
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

    // Center value inside the arc.
    ctx.fillStyle = '#e2e8f0';
    ctx.font = this._fontVal;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(pct)}%`, cx, cy);

    // Keep compact surface label near the bottom of the arc zone.
    ctx.fillStyle = color + 'aa';
    ctx.font = this._fontLbl;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(LABELS[this._surface], cx, this._arcY + this._arcH - 4);
  }

}
