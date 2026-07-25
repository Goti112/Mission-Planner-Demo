/**
 * DetachedSurfacesContext.ts
 *
 * React context that shares detached surface state between the drawer
 * (which renders slot placeholders) and the widget layer (which renders
 * floating widgets).
 */

import { createContext, useContext } from 'react';

export type SurfaceId = 'ail' | 'elv' | 'rdr' | 'thr' | 'flp';

export interface ZoneFlags {
  icon: boolean;
  arc: boolean;
  val: boolean;
}

export type DetachedLayout = 'vertical' | 'horizontal' | 'grid';

export interface DetachedEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  layout: DetachedLayout;
  zones: ZoneFlags;
}

export type DetachedMap = Partial<Record<SurfaceId, DetachedEntry>>;

export interface DetachedSurfacesContextValue {
  detachedMap: DetachedMap;
  detach:      (id: SurfaceId, x: number, y: number) => void;
  reattach:    (id: SurfaceId) => void;
  move:        (id: SurfaceId, x: number, y: number) => void;
  setZones:    (id: SurfaceId, zones: ZoneFlags) => void;
  resize:      (id: SurfaceId, width: number, height: number) => void;
  setLayout:   (id: SurfaceId, layout: DetachedLayout) => void;
}

export const DetachedSurfacesContext = createContext<DetachedSurfacesContextValue>({
  detachedMap: {},
  detach:   () => {},
  reattach: () => {},
  move:     () => {},
  setZones: () => {},
  resize:   () => {},
  setLayout: () => {},
});

export function useDetachedSurfacesContext(): DetachedSurfacesContextValue {
  return useContext(DetachedSurfacesContext);
}
