/**
 * ControlSurfacesDrawer.tsx
 *
 * Bottom-left slide-out panel for the Control Surfaces instrument.
 * When collapsed, only a compact trigger sits inside the status-bar zone
 * so the map remains fully visible.
 *
 * Each of the 5 surface columns is rendered in its own slot.
 * Hovering a slot reveals a drag handle. Dragging the column out of the
 * panel detaches it as a floating SurfaceWidget. The slot shows a
 * placeholder while the column is detached.
 *
 * Mount once in App.tsx (outside the view router), inside
 * DetachedSurfacesContext.Provider.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, X, Maximize2, Minimize2, LayoutGrid, PanelLeft, Rows3 } from 'lucide-react';

import ControlSurfaceSingleCanvas from './ControlSurfaceSingleCanvas';
import { useDetachedSurfacesContext } from '../../../shared/contexts/DetachedSurfacesContext';
import type { SurfaceId } from '../instruments/ControlSurfaceInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { SnapshotProvider } from '../hooks/useHUDLoop';
import {
  clampControlPanelPosition,
  clampControlPanelSize,
  CONTROL_PANEL_DEFAULT_RECT,
  detectControlPanelAnchor,
  getViewportSize,
  resolveControlPanelLayout,
  snapControlPanelRect,
  type ControlPanelAnchor,
  type ControlPanelOrientationMode,
} from './controlSurfacesPanelLayout';

import './ControlSurfacesDrawer.css';

// ── Surface order ──────────────────────────────────────────────────────────

const SURFACES: SurfaceId[] = ['ail', 'elv', 'rdr', 'thr', 'flp'];

const SURFACE_COLORS: Record<SurfaceId, string> = {
  ail: '#22d3ee', elv: '#f97316', rdr: '#a78bfa', thr: '#4ade80', flp: '#fbbf24',
};

const SURFACE_LABELS: Record<SurfaceId, string> = {
  ail: 'AIL', elv: 'ELV', rdr: 'RDR', thr: 'THR', flp: 'FLAPS',
};

// ── Default zone flags ─────────────────────────────────────────────────────

const DEFAULT_ZONES = { icon: true, arc: true, val: true };

const PANEL_MODE_BASE_SIZE: Record<ControlPanelOrientationMode, { width: number; height: number }> = {
  auto: { width: 560, height: 330 },
  horizontal: { width: 620, height: 270 },
  vertical: { width: 330, height: 620 },
  grid: { width: 560, height: 410 },
};

// ── Props ──────────────────────────────────────────────────────────────────

export interface ControlSurfacesDrawerProps {
  telemetry:         FlightTelemetry;
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
}

// ── Per-slot drag state ────────────────────────────────────────────────────

interface DragState {
  surface: SurfaceId;
  ghostX: number;
  ghostY: number;
  originX: number;
  originY: number;
  startClientX: number;
  startClientY: number;
}

interface PanelDragState {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

type PanelResizeHandle = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw';

interface PanelResizeState {
  handle: PanelResizeHandle;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
}

interface DrawerPanelPersistedState {
  detached: boolean;
  open: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: ControlPanelOrientationMode;
  anchor: ControlPanelAnchor;
}

const DRAWER_PANEL_STORAGE_KEY = 'rohu:control-surfaces-drawer-panel';

function loadDrawerPanelState(): DrawerPanelPersistedState {
  const defaults: DrawerPanelPersistedState = {
    detached: false,
    open: false,
    x: CONTROL_PANEL_DEFAULT_RECT.x,
    y: CONTROL_PANEL_DEFAULT_RECT.y,
    width: 390,
    height: 310,
    mode: 'auto',
    anchor: 'none',
  };

  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(DRAWER_PANEL_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<DrawerPanelPersistedState>;
    const mode =
      parsed.mode === 'auto' || parsed.mode === 'horizontal' || parsed.mode === 'vertical' || parsed.mode === 'grid'
        ? parsed.mode
        : defaults.mode;
    const anchor =
      parsed.anchor === 'none' || parsed.anchor === 'left' || parsed.anchor === 'right' || parsed.anchor === 'top' || parsed.anchor === 'bottom'
        ? parsed.anchor
        : defaults.anchor;
    const viewport = getViewportSize();
    const requestedSize = {
      width: typeof parsed.width === 'number' ? parsed.width : defaults.width,
      height: typeof parsed.height === 'number' ? parsed.height : defaults.height,
    };
    const resolved = resolveControlPanelLayout(mode, anchor, requestedSize);
    const size = clampControlPanelSize(requestedSize, resolved, viewport);
    const pos = clampControlPanelPosition(
      {
        x: typeof parsed.x === 'number' ? parsed.x : defaults.x,
        y: typeof parsed.y === 'number' ? parsed.y : defaults.y,
      },
      size,
      viewport,
    );

    return {
      detached: typeof parsed.detached === 'boolean' ? parsed.detached : defaults.detached,
      open: typeof parsed.open === 'boolean' ? parsed.open : defaults.open,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      mode,
      anchor,
    };
  } catch {
    return defaults;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

const ControlSurfacesDrawer: React.FC<ControlSurfacesDrawerProps> = ({
  telemetry,
  snapshotProvider,
}) => {
  const persistedState = loadDrawerPanelState();
  const [open, setOpen] = useState(persistedState.open);
  const [panelDetached, setPanelDetached] = useState(persistedState.detached);
  const [panelPos, setPanelPos] = useState({ x: persistedState.x, y: persistedState.y });
  const [panelSize, setPanelSize] = useState({ width: persistedState.width, height: persistedState.height });
  const [panelMode, setPanelMode] = useState<ControlPanelOrientationMode>(persistedState.mode);
  const [panelAnchor, setPanelAnchor] = useState<ControlPanelAnchor>(persistedState.anchor);
  const [panelDrag, setPanelDrag] = useState<PanelDragState | null>(null);
  const [panelResize, setPanelResize] = useState<PanelResizeState | null>(null);
  const { detachedMap, detach, reattach } = useDetachedSurfacesContext();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const slotRefs = useRef<Partial<Record<SurfaceId, HTMLDivElement | null>>>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [panelLeft, setPanelLeft] = useState<number>(0);

  // Keep panel left-aligned with the tab element (fixed positioning)
  useEffect(() => {
    if (panelDetached) return;
    const update = (): void => {
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        setPanelLeft(rect.left);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [panelDetached, open]);

  const resolvedLayout = resolveControlPanelLayout(
    panelMode,
    panelAnchor,
    { width: panelSize.width, height: panelSize.height },
  );
  const canResizePanel = panelDetached && panelMode === 'auto';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: DrawerPanelPersistedState = {
      detached: panelDetached,
      open,
      x: panelPos.x,
      y: panelPos.y,
      width: panelSize.width,
      height: panelSize.height,
      mode: panelMode,
      anchor: panelAnchor,
    };
    window.localStorage.setItem(DRAWER_PANEL_STORAGE_KEY, JSON.stringify(payload));
  }, [open, panelDetached, panelPos.x, panelPos.y, panelSize.height, panelSize.width, panelMode, panelAnchor]);

  const applyPanelMode = useCallback((mode: ControlPanelOrientationMode) => {
    const viewport = getViewportSize();
    const suggested = PANEL_MODE_BASE_SIZE[mode];
    const targetSize = suggested;
    const resolved = resolveControlPanelLayout(mode, panelAnchor, targetSize);
    const size = clampControlPanelSize(targetSize, resolved, viewport);
    const pos = clampControlPanelPosition(panelPos, size, viewport);
    setPanelMode(mode);
    setPanelSize(size);
    setPanelPos(pos);
    setPanelResize(null);
  }, [panelAnchor, panelPos]);

  const onModeButtonPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, mode: ControlPanelOrientationMode) => {
    e.stopPropagation();
    applyPanelMode(mode);
  }, [applyPanelMode]);

  const onModeButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>, mode: ControlPanelOrientationMode) => {
    e.stopPropagation();
    applyPanelMode(mode);
  }, [applyPanelMode]);

  // ── Panel detach/dock ──────────────────────────────────────────────────

  const detachPanel = useCallback(() => {
    const x = Math.max(0, window.innerWidth / 2 - 195);
    const y = Math.max(0, window.innerHeight / 2 - 155);
    setPanelPos({ x, y });
    setPanelAnchor('none');
    setPanelDetached(true);
    setOpen(true);
  }, []);

  const dockPanel = useCallback(() => {
    setPanelDetached(false);
    setPanelAnchor('none');
    setPanelResize(null);
  }, []);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panelDetached) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanelDrag({ sx: e.clientX, sy: e.clientY, ox: panelPos.x, oy: panelPos.y });
  }, [panelDetached, panelPos]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panelDrag) return;
    const viewport = getViewportSize();
    const candidate = {
      x: panelDrag.ox + (e.clientX - panelDrag.sx),
      y: panelDrag.oy + (e.clientY - panelDrag.sy),
      width: panelSize.width,
      height: panelSize.height,
    };
    const anchor = detectControlPanelAnchor(candidate, viewport);
    const snapped = snapControlPanelRect(candidate, anchor, viewport);
    const clampedPos = clampControlPanelPosition(
      { x: snapped.x, y: snapped.y },
      { width: panelSize.width, height: panelSize.height },
      viewport,
    );
    setPanelPos(clampedPos);
    setPanelAnchor(anchor);
  }, [panelDrag, panelSize.height, panelSize.width]);

  const onHeaderPointerUp = useCallback(() => {
    setPanelDrag(null);
  }, []);

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, handle: PanelResizeHandle) => {
    if (!canResizePanel || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanelResize({
      handle,
      sx: e.clientX,
      sy: e.clientY,
      ox: panelPos.x,
      oy: panelPos.y,
      ow: panelSize.width,
      oh: panelSize.height,
    });
  }, [canResizePanel, panelPos.x, panelPos.y, panelSize.height, panelSize.width]);

  useEffect(() => {
    if (!panelResize) return;
    if (!canResizePanel) return;
    const onMove = (e: PointerEvent): void => {
      const dx = e.clientX - panelResize.sx;
      const dy = e.clientY - panelResize.sy;
      let nextX = panelResize.ox;
      let nextY = panelResize.oy;
      let nextWidth = panelResize.ow;
      let nextHeight = panelResize.oh;

      if (panelResize.handle.includes('e')) nextWidth = panelResize.ow + dx;
      if (panelResize.handle.includes('s')) nextHeight = panelResize.oh + dy;
      if (panelResize.handle.includes('w')) {
        nextWidth = panelResize.ow - dx;
        nextX = panelResize.ox + dx;
      }
      if (panelResize.handle.includes('n')) {
        nextHeight = panelResize.oh - dy;
        nextY = panelResize.oy + dy;
      }

      const viewport = getViewportSize();
      const size = clampControlPanelSize(
        { width: nextWidth, height: nextHeight },
        resolveControlPanelLayout(panelMode, panelAnchor, { width: nextWidth, height: nextHeight }),
        viewport,
      );
      const pos = clampControlPanelPosition(
        { x: nextX, y: nextY },
        { width: size.width, height: size.height },
        viewport,
      );
      setPanelSize(size);
      setPanelPos(pos);
    };

    const onUp = (): void => {
      setPanelResize(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [canResizePanel, panelAnchor, panelMode, panelResize]);

  // ── Drag-to-detach ─────────────────────────────────────────────────────

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, surface: SurfaceId) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      const slotEl = slotRefs.current[surface];
      const rect = slotEl?.getBoundingClientRect();
      const ox = rect?.left ?? e.clientX - 40;
      const oy = rect?.top  ?? e.clientY - 20;

      setDragState({
        surface,
        ghostX: ox,
        ghostY: oy,
        originX: ox,
        originY: oy,
        startClientX: e.clientX,
        startClientY: e.clientY,
      });
    },
    [],
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startClientX;
      const dy = e.clientY - dragState.startClientY;
      setDragState(prev =>
        prev
          ? { ...prev, ghostX: prev.originX + dx, ghostY: prev.originY + dy }
          : null,
      );
    },
    [dragState],
  );

  const onHandlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startClientX;
      const dy = e.clientY - dragState.startClientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 20) {
        // Detach at drop position
        const dropX = Math.max(0, Math.min(dragState.ghostX, window.innerWidth  - 130));
        const dropY = Math.max(0, Math.min(dragState.ghostY, window.innerHeight - 260));
        detach(dragState.surface, dropX, dropY);
      }
      setDragState(null);
    },
    [dragState, detach],
  );

  const wrapperStyle: React.CSSProperties = panelDetached
    ? { left: panelPos.x, top: panelPos.y }
    : {};

  const panelStyle: React.CSSProperties = panelDetached
    ? { width: panelSize.width, height: panelSize.height }
    : { left: panelLeft };

  return (
    <div
      ref={wrapperRef}
      id="control-surfaces-drawer"
      className={`csd-wrapper${open || panelDetached ? ' csd-wrapper--open' : ''}${panelDetached ? ' csd-wrapper--floating' : ''}${panelDetached ? ` csd-wrapper--anchor-${panelAnchor}` : ''}`}
      style={wrapperStyle}
    >
      {/* Tab — inline button visible in the statusbar */}
      {!panelDetached && (
        <button
          className="csd-tab"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls="csd-panel-body"
          title="Superficies de Control"
        >
          <span className="csd-trigger-label">CTRL</span>
          <ChevronUp size={8} className="csd-chevron" />
        </button>
      )}

        <div
          id="csd-panel-body"
          className={`csd-panel csd-panel--${resolvedLayout}`}
          style={panelStyle}
          role="complementary"
          aria-label="Superficies de Control"
          aria-hidden={!open && !panelDetached}
        >
          <div
            className={`csd-header${panelDetached ? ' csd-header--draggable' : ''}`}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
          >
            <div className="csd-heading">
              <span className="csd-title">Superficies CTRL</span>
            </div>
            {panelDetached && (
              <div className="csd-mode-control" onPointerDown={e => e.stopPropagation()}>
                <button
                  type="button"
                  className={`csd-mode-btn${panelMode === 'auto' ? ' csd-mode-btn--active' : ''}`}
                  onPointerDown={e => onModeButtonPointerDown(e, 'auto')}
                  onClick={e => onModeButtonClick(e, 'auto')}
                  title="Modo automatico"
                  aria-pressed={panelMode === 'auto'}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={`csd-mode-btn${panelMode === 'horizontal' ? ' csd-mode-btn--active' : ''}`}
                  onPointerDown={e => onModeButtonPointerDown(e, 'horizontal')}
                  onClick={e => onModeButtonClick(e, 'horizontal')}
                  title="Horizontal"
                  aria-pressed={panelMode === 'horizontal'}
                >
                  <Rows3 size={12} />
                </button>
                <button
                  type="button"
                  className={`csd-mode-btn${panelMode === 'vertical' ? ' csd-mode-btn--active' : ''}`}
                  onPointerDown={e => onModeButtonPointerDown(e, 'vertical')}
                  onClick={e => onModeButtonClick(e, 'vertical')}
                  title="Vertical"
                  aria-pressed={panelMode === 'vertical'}
                >
                  <PanelLeft size={12} />
                </button>
                <button
                  type="button"
                  className={`csd-mode-btn${panelMode === 'grid' ? ' csd-mode-btn--active' : ''}`}
                  onPointerDown={e => onModeButtonPointerDown(e, 'grid')}
                  onClick={e => onModeButtonClick(e, 'grid')}
                  title="Grid"
                  aria-pressed={panelMode === 'grid'}
                >
                  <LayoutGrid size={12} />
                </button>
              </div>
            )}
            {panelDetached ? (
              <button
                className="csd-header-btn"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); dockPanel(); }}
                aria-label="Acoplar panel"
                title="Acoplar panel"
              >
                <Minimize2 size={12} />
              </button>
            ) : (
              <button
                className="csd-header-btn"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); detachPanel(); }}
                aria-label="Desacoplar panel"
                title="Desacoplar panel"
              >
                <Maximize2 size={12} />
              </button>
            )}
            <button
              className="csd-close"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                setPanelResize(null);
                setPanelDetached(false);
                setOpen(false);
              }}
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>

        {/* ── 5 individual column slots ─────────────────────────────── */}
          <div className="csd-body" onDoubleClick={panelDetached ? dockPanel : undefined}>
          <div className={`csd-slots csd-slots--${resolvedLayout}`}>
            {SURFACES.map(surface => {
              const isDetached = !!detachedMap[surface];
              const zones = detachedMap[surface]?.zones ?? DEFAULT_ZONES;
              const color = SURFACE_COLORS[surface];

              const onDoubleClick = () => {
                if (isDetached) return;
                const slotEl = slotRefs.current[surface];
                const rect = slotEl?.getBoundingClientRect();
                const x = rect ? Math.max(0, rect.left) : 200;
                const y = rect ? Math.max(0, rect.top - 160) : 200;
                detach(surface, x, y);
              };

              return (
                <div
                  key={surface}
                  className="csd-slot"
                  ref={el => { slotRefs.current[surface] = el; }}
                  onDoubleClick={onDoubleClick}
                  title={isDetached ? undefined : `Doble clic para separar ${SURFACE_LABELS[surface]}`}
                >
                  {isDetached ? (
                    /* Placeholder — click to reattach */
                    <div
                      className="csd-slot-placeholder"
                      onClick={() => reattach(surface)}
                      title="Click para reacoplar"
                    >
                      <span
                        className="csd-slot-placeholder-label"
                        style={{ color: color + '55' }}
                      >
                        {SURFACE_LABELS[surface]}
                      </span>
                      <span className="csd-slot-placeholder-hint">↗</span>
                    </div>
                  ) : (
                    <>
                      {/* Drag handle overlay */}
                      <div
                        className="csd-slot-handle"
                        onPointerDown={e => onHandlePointerDown(e, surface)}
                        onPointerMove={onHandlePointerMove}
                        onPointerUp={onHandlePointerUp}
                        onPointerCancel={() => setDragState(null)}
                        title={`Drag to detach ${SURFACE_LABELS[surface]}`}
                        style={{ pointerEvents: 'auto', cursor: 'grab' }}
                        aria-label={`Drag ${SURFACE_LABELS[surface]} to detach`}
                      >
                        ⠿
                      </div>

                      {/* Single-surface canvas */}
                      <ControlSurfaceSingleCanvas
                        surface={surface}
                        zones={zones}
                        telemetry={telemetry}
                        snapshotProvider={snapshotProvider}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>

        {canResizePanel && (
          <>
            {(['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'] as const).map((handle) => (
              <div
                key={handle}
                className={`csd-resize-handle csd-resize-handle--${handle}`}
                onPointerDown={e => onResizePointerDown(e, handle)}
                title="Redimensionar panel"
              />
            ))}
          </>
        )}

      {/* Drag ghost */}
      {dragState && (
        <div
          className="csd-slot-ghost"
          style={{ left: dragState.ghostX, top: dragState.ghostY }}
          aria-hidden="true"
        >
          <ControlSurfaceSingleCanvas
            surface={dragState.surface}
            zones={DEFAULT_ZONES}
            telemetry={telemetry}
            snapshotProvider={snapshotProvider}
          />
        </div>
      )}
    </div>
  );
};

export default ControlSurfacesDrawer;
