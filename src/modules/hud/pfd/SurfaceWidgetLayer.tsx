/**
 * SurfaceWidgetLayer.tsx
 *
 * Renders all active floating surface widgets from the DetachedSurfacesContext.
 * Mount this once in App.tsx at the top of the component tree.
 */

import React from 'react';
import SurfaceWidget from './SurfaceWidget';
import { useDetachedSurfacesContext } from '../../../shared/contexts/DetachedSurfacesContext';
import type { SurfaceId } from '../instruments/ControlSurfaceInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { SnapshotProvider } from '../hooks/useHUDLoop';

interface SurfaceWidgetLayerProps {
  telemetry:         FlightTelemetry;
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
}

const SurfaceWidgetLayer: React.FC<SurfaceWidgetLayerProps> = ({ telemetry, snapshotProvider }) => {
  const { detachedMap } = useDetachedSurfacesContext();

  const entries = Object.entries(detachedMap) as [SurfaceId, NonNullable<typeof detachedMap[SurfaceId]>][];

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([surface, entry]) => (
        <SurfaceWidget
          key={surface}
          surface={surface}
          x={entry.x}
          y={entry.y}
          width={entry.width}
          height={entry.height}
          layout={entry.layout}
          zones={entry.zones}
          telemetry={telemetry}
          snapshotProvider={snapshotProvider}
        />
      ))}
    </>
  );
};

export default SurfaceWidgetLayer;
