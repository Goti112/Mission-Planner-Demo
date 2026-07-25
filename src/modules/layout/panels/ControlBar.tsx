import React, { useMemo } from 'react';
import { useUIStore } from '../../../shared/store/uiStore';
import { formatCoordinatePair, type CoordinateFormat } from '../../../utils/coordinateFormat';
import './ControlBar.css';

interface ControlBarProps {
  droneLat: number;
  droneLon: number;
  show3D?: boolean;
}

const ControlBar: React.FC<ControlBarProps> = ({
  droneLat,
  droneLon,
  show3D: _show3D = false,
}) => {
  const coordFormat        = useUIStore((s) => s.coordinateFormat);
  const setCoordinateFormat = useUIStore((s) => s.setCoordinateFormat);
  const cameraMode         = useUIStore((s) => s.cameraMode);
  const setCameraMode      = useUIStore((s) => s.setCameraMode);

  const coordsDisplay = useMemo(() => {
    return formatCoordinatePair(coordFormat, droneLat, droneLon);
  }, [coordFormat, droneLat, droneLon]);

  return (
    <div className="control-bar">
      <span className="coords-display">{coordsDisplay}</span>

      <select
        value={coordFormat}
        onChange={(event) => setCoordinateFormat(event.target.value as CoordinateFormat)}
        aria-label="Coordinate format"
        title={`Coords: ${coordsDisplay}`}
      >
        <option value="geo">GEO</option>
        <option value="mgrs">MGRS</option>
        <option value="utm">UTM</option>
      </select>

      <button
        className={cameraMode === 'AUTO_CENTER' ? 'active' : ''}
        onClick={() => setCameraMode(cameraMode === 'AUTO_CENTER' ? 'FREE' : 'AUTO_CENTER')}
        title={cameraMode === 'AUTO_CENTER' ? 'AutoCenter activado' : 'AutoCenter desactivado'}
      >
        AutoCenter
      </button>
    </div>
  );
};

export default ControlBar;
