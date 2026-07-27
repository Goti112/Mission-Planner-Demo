/**
 * controlSurfacesPanelLayout.ts
 *
 * Pure model layer for the floating Control Surfaces panel.
 * No React, no DOM side-effects. All functions are pure or localStorage-scoped.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export type ControlPanelOrientationMode = 'auto' | 'horizontal' | 'vertical' | 'grid';
export type ControlPanelResolvedLayout  = 'horizontal' | 'vertical' | 'grid';
export type ControlPanelAnchor         = 'none' | 'left' | 'right' | 'top' | 'bottom';

export interface ControlPanelPoint {
  x: number;
  y: number;
}

export interface ControlPanelSize {
  width: number;
  height: number;
}

export interface ControlPanelRect extends ControlPanelPoint, ControlPanelSize {}

export interface PersistedControlSurfacesPanelState extends ControlPanelRect {
  floating: boolean;
  mode: ControlPanelOrientationMode;
  anchor: ControlPanelAnchor;
}

// ── Constants ─────────────────────────────────────────────────────────────

export const CONTROL_PANEL_STORAGE_KEY = 'mission:control-surfaces-panel';
export const CONTROL_PANEL_SNAP_PX     = 28;

export const CONTROL_PANEL_DEFAULT_RECT: ControlPanelRect = {
  x: 460,
  y: 64,
  width: 420,
  height: 300,
};

export const CONTROL_PANEL_MIN_SIZE_BY_LAYOUT: Record<ControlPanelResolvedLayout, ControlPanelSize> = {
  horizontal: { width: 340, height: 180 },
  vertical:   { width: 220, height: 360 },
  grid:       { width: 300, height: 260 },
};

// ── Layout resolution ─────────────────────────────────────────────────────

export function resolveControlPanelLayout(
  mode: ControlPanelOrientationMode,
  anchor: ControlPanelAnchor,
  size: Readonly<ControlPanelSize>,
): ControlPanelResolvedLayout {
  if (mode !== 'auto') return mode;
  if (anchor === 'left' || anchor === 'right') return 'vertical';
  if (anchor === 'top' || anchor === 'bottom') return 'horizontal';

  const widthRatio  = size.width / size.height;
  const heightRatio = size.height / size.width;
  if (widthRatio  >= 1.45) return 'horizontal';
  if (heightRatio >= 1.25) return 'vertical';
  return 'grid';
}

// ── Size clamping ─────────────────────────────────────────────────────────

export function clampControlPanelSize(
  requested: Readonly<ControlPanelSize>,
  layout: ControlPanelResolvedLayout,
  viewport: Readonly<ControlPanelSize>,
): ControlPanelSize {
  const minSize = CONTROL_PANEL_MIN_SIZE_BY_LAYOUT[layout];
  return {
    width:  Math.min(viewport.width,  Math.max(minSize.width,  requested.width)),
    height: Math.min(viewport.height, Math.max(minSize.height, requested.height)),
  };
}

// ── Position clamping ─────────────────────────────────────────────────────

export function clampControlPanelPosition(
  requested: Readonly<ControlPanelPoint>,
  size: Readonly<ControlPanelSize>,
  viewport: Readonly<ControlPanelSize>,
): ControlPanelPoint {
  return {
    x: Math.max(0, Math.min(viewport.width  - size.width,  requested.x)),
    y: Math.max(0, Math.min(viewport.height - size.height, requested.y)),
  };
}

// ── Anchor detection ──────────────────────────────────────────────────────

export function detectControlPanelAnchor(
  rect: Readonly<ControlPanelRect>,
  viewport: Readonly<ControlPanelSize>,
): ControlPanelAnchor {
  if (rect.x <= CONTROL_PANEL_SNAP_PX) return 'left';
  if (rect.x + rect.width  >= viewport.width  - CONTROL_PANEL_SNAP_PX) return 'right';
  if (rect.y <= CONTROL_PANEL_SNAP_PX) return 'top';
  if (rect.y + rect.height >= viewport.height - CONTROL_PANEL_SNAP_PX) return 'bottom';
  return 'none';
}

// ── Snap to anchor ────────────────────────────────────────────────────────

export function snapControlPanelRect(
  rect: Readonly<ControlPanelRect>,
  anchor: ControlPanelAnchor,
  viewport: Readonly<ControlPanelSize>,
): ControlPanelRect {
  if (anchor === 'left')   return { ...rect, x: 0 };
  if (anchor === 'right')  return { ...rect, x: viewport.width  - rect.width };
  if (anchor === 'top')    return { ...rect, y: 0 };
  if (anchor === 'bottom') return { ...rect, y: viewport.height - rect.height };
  return rect;
}

// ── Viewport helper ───────────────────────────────────────────────────────

export function getViewportSize(): ControlPanelSize {
  if (typeof window === 'undefined') {
    return { width: 1920, height: 1080 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

// ── Type guards ───────────────────────────────────────────────────────────

export function isControlPanelMode(value: unknown): value is ControlPanelOrientationMode {
  return value === 'auto' || value === 'horizontal' || value === 'vertical' || value === 'grid';
}

export function isControlPanelAnchor(value: unknown): value is ControlPanelAnchor {
  return value === 'none' || value === 'left' || value === 'right' || value === 'top' || value === 'bottom';
}

// ── Persistence ───────────────────────────────────────────────────────────

export function loadControlPanelState(): PersistedControlSurfacesPanelState {
  const defaults: PersistedControlSurfacesPanelState = {
    floating: false,
    ...CONTROL_PANEL_DEFAULT_RECT,
    mode: 'auto',
    anchor: 'none',
  };

  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(CONTROL_PANEL_STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<PersistedControlSurfacesPanelState>;
    return {
      floating: typeof parsed.floating === 'boolean' ? parsed.floating : defaults.floating,
      x:        typeof parsed.x        === 'number'  ? parsed.x        : defaults.x,
      y:        typeof parsed.y        === 'number'  ? parsed.y        : defaults.y,
      width:    typeof parsed.width    === 'number'  ? parsed.width    : defaults.width,
      height:   typeof parsed.height   === 'number'  ? parsed.height   : defaults.height,
      mode:     isControlPanelMode(parsed.mode)     ? parsed.mode     : defaults.mode,
      anchor:   isControlPanelAnchor(parsed.anchor) ? parsed.anchor   : defaults.anchor,
    };
  } catch {
    return defaults;
  }
}

export function saveControlPanelState(state: Readonly<PersistedControlSurfacesPanelState>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONTROL_PANEL_STORAGE_KEY, JSON.stringify(state));
}
