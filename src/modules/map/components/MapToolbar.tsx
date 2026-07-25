import { Box } from 'lucide-react';
import { useUIStore } from '../../../shared/store/uiStore';
import type { MapStyle } from '../../../shared/store/uiStore';

interface MapToolbarProps {
  className?: string;
}

/**
 * Shared map selection toolbar.
 * Supports mutually exclusive base styles (Mapa, Dark, Satellite, Hybrid)
 * and a separate toggle for 3D view.
 */
export const MapToolbar: React.FC<MapToolbarProps> = ({ className = 'gcs-map-toolbar' }) => {
  const mapStyle = useUIStore((s) => s.mapStyle);
  const setMapStyle = useUIStore((s) => s.setMapStyle);
  const show3D = useUIStore((s) => s.show3D);
  const setShow3D = useUIStore((s) => s.setShow3D);
  const show3DBuildings = useUIStore((s) => s.show3DBuildings);
  const setShow3DBuildings = useUIStore((s) => s.setShow3DBuildings);

  const styles: { id: MapStyle; label: string }[] = [
    { id: 'streets', label: 'Mapa' },
    { id: 'dark', label: 'Dark' },
    { id: 'satellite', label: 'Satélite' },
    { id: 'hybrid', label: 'Híbrido' },
  ];

  return (
    <div className={className}>
      {styles.map((s) => (
        <button
          key={s.id}
          className={`gcs-map-tool-btn ${mapStyle === s.id ? 'gcs-map-tool-btn--active' : ''}`}
          onClick={() => setMapStyle(s.id)}
        >
          {s.label}
        </button>
      ))}

      <div className="gcs-map-tool-divider" />

      <button
        className={`gcs-map-tool-btn ${show3D ? 'gcs-map-tool-btn--active' : ''}`}
        onClick={() => setShow3D(!show3D)}
        title="Activar vista 3D"
      >
                <Box size={12} /> 3D
      </button>

      {show3D && (
        <button
          className={`gcs-map-tool-btn ${show3DBuildings ? 'gcs-map-tool-btn--active' : ''}`}
          onClick={() => setShow3DBuildings(!show3DBuildings)}
          title="Alternar edificios 3D"
        >
          Edificios
        </button>
      )}
    </div>
  );
};
