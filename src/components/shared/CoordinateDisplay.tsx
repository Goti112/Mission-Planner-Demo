import React from 'react';
import { formatCoordinateRows } from '../../utils/coordinateFormat';
import { useUIStore } from '../../shared/store/uiStore';

interface CoordinateDisplayProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly className?: string;
  readonly rowClassName?: string;
  readonly labelClassName?: string;
  readonly valueClassName?: string;
}

export const CoordinateDisplay: React.FC<CoordinateDisplayProps> = ({
  latitude,
  longitude,
  className = '',
  rowClassName = 'coordinate-display__row',
  labelClassName = 'coordinate-display__label',
  valueClassName = 'coordinate-display__value',
}) => {
  const coordinateFormat = useUIStore((s) => s.coordinateFormat);
  const rows = formatCoordinateRows(coordinateFormat, latitude, longitude);

  return (
    <div className={`coordinate-display ${className}`}>
      {rows.map((row) => (
        <div key={row.label} className={rowClassName}>
          <span className={labelClassName}>{row.label}</span>
          <span className={valueClassName}>{row.value}</span>
        </div>
      ))}
    </div>
  );
};
