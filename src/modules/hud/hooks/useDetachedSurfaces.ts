/**
 * useDetachedSurfaces.ts
 *
 * State management + localStorage persistence for detached surface widgets.
 * Tracks which columns are detached and their positions / zone visibility.
 */

import { useCallback, useState } from 'react';
import type {
  DetachedEntry,
  DetachedLayout,
  DetachedMap,
  SurfaceId,
  ZoneFlags,
} from '../../../shared/contexts/DetachedSurfacesContext';

const STORAGE_KEY = 'mission:detached-surfaces';
const DEFAULT_ZONES: ZoneFlags = { icon: true, arc: true, val: true };
const MIN_WIDTH_PX = 110;
const MIN_HEIGHT_PX = 120;

const LAYOUT_SIZES: Record<DetachedLayout, { width: number; height: number }> = {
  vertical: { width: 130, height: 260 },
  horizontal: { width: 280, height: 150 },
  grid: { width: 220, height: 220 },
};

const LAYOUT_ZONES: Record<DetachedLayout, ZoneFlags> = {
  vertical:   { icon: true,  arc: true,  val: false },
  horizontal: { icon: false, arc: true,  val: false },
  grid:       { icon: true,  arc: false, val: false },
};

function clampSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(MIN_WIDTH_PX, width),
    height: Math.max(MIN_HEIGHT_PX, height),
  };
}

function clampPosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x, y };
  }

  return {
    x: Math.max(0, Math.min(x, window.innerWidth - width)),
    y: Math.max(0, Math.min(y, window.innerHeight - height)),
  };
}

function isZoneFlags(value: unknown): value is ZoneFlags {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.icon === 'boolean'
    && typeof candidate.arc === 'boolean'
    && typeof candidate.val === 'boolean';
}

function loadFromStorage(): DetachedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DetachedMap;
    // Validate shape minimally
    if (typeof parsed !== 'object' || parsed === null) return {};

    const restored: DetachedMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === null || typeof value !== 'object') continue;

      const entry = value as Partial<DetachedEntry>;
      if (typeof entry.x !== 'number' || typeof entry.y !== 'number') continue;

      const zones = isZoneFlags(entry.zones) ? entry.zones : DEFAULT_ZONES;
      const layout = entry.layout === 'horizontal' || entry.layout === 'grid' || entry.layout === 'vertical'
        ? entry.layout
        : 'vertical';
      const { width, height } = clampSize(
        typeof entry.width === 'number' ? entry.width : LAYOUT_SIZES[layout].width,
        typeof entry.height === 'number' ? entry.height : LAYOUT_SIZES[layout].height,
      );
      const { x, y } = clampPosition(entry.x, entry.y, width, height);
      restored[key as SurfaceId] = { x, y, width, height, layout, zones };
    }

    return restored;
  } catch {
    return {};
  }
}

function saveToStorage(map: DetachedMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors (e.g. private mode quota)
  }
}

export function useDetachedSurfaces() {
  const [detachedMap, setDetachedMap] = useState<DetachedMap>(() => loadFromStorage());

  const detach = useCallback((id: SurfaceId, x: number, y: number): void => {
    setDetachedMap(prev => {
      const prevEntry = prev[id];
      const layout = prevEntry?.layout ?? 'vertical';
      const baseSize = prevEntry
        ? clampSize(prevEntry.width, prevEntry.height)
        : LAYOUT_SIZES[layout];
      const nextPosition = clampPosition(x, y, baseSize.width, baseSize.height);
      const next: DetachedMap = {
        ...prev,
        [id]: {
          ...nextPosition,
          width: baseSize.width,
          height: baseSize.height,
          layout,
          zones: prev[id]?.zones ?? DEFAULT_ZONES,
        },
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  const reattach = useCallback((id: SurfaceId): void => {
    setDetachedMap(prev => {
      const next: DetachedMap = { ...prev };
      delete next[id];
      saveToStorage(next);
      return next;
    });
  }, []);

  const move = useCallback((id: SurfaceId, x: number, y: number): void => {
    setDetachedMap(prev => {
      const entry = prev[id];
      if (!entry) return prev;
      const nextPosition = clampPosition(x, y, entry.width, entry.height);
      const next: DetachedMap = { ...prev, [id]: { ...entry, ...nextPosition } };
      saveToStorage(next);
      return next;
    });
  }, []);

  const setZones = useCallback((id: SurfaceId, zones: ZoneFlags): void => {
    setDetachedMap(prev => {
      const entry = prev[id];
      if (!entry) return prev;
      const next: DetachedMap = { ...prev, [id]: { ...entry, zones } };
      saveToStorage(next);
      return next;
    });
  }, []);

  const resize = useCallback((id: SurfaceId, width: number, height: number): void => {
    setDetachedMap(prev => {
      const entry = prev[id];
      if (!entry) return prev;
      const nextSize = clampSize(width, height);
      const nextPosition = clampPosition(entry.x, entry.y, nextSize.width, nextSize.height);
      const next: DetachedMap = {
        ...prev,
        [id]: { ...entry, ...nextSize, ...nextPosition },
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  const setLayout = useCallback((id: SurfaceId, layout: DetachedLayout): void => {
    setDetachedMap(prev => {
      const entry = prev[id];
      if (!entry) return prev;
      const size = LAYOUT_SIZES[layout];
      const nextPosition = clampPosition(entry.x, entry.y, size.width, size.height);
      const next: DetachedMap = {
        ...prev,
        [id]: { ...entry, ...nextPosition, width: size.width, height: size.height, layout, zones: LAYOUT_ZONES[layout] },
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  return { detachedMap, detach, reattach, move, setZones, resize, setLayout };
}
