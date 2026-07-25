import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Home, LocateFixed, Route } from 'lucide-react';
import './MapFrameControl.css';

interface MapFrameControlProps {
  readonly canZoomToMission: boolean;
  readonly canZoomToVehicle: boolean;
  readonly canZoomToHome: boolean;
  readonly onZoomToMission: () => void;
  readonly onZoomToVehicle: () => void;
  readonly onZoomToHome: () => void;
  readonly className?: string;
}

type FrameControlStyle = CSSProperties & {
  '--frame-control-gap': string;
};

const buildClassName = (baseClassName: string, className: string | undefined): string =>
  [baseClassName, className].filter(Boolean).join(' ');

const renderButton = (
  className: string,
  icon: ReactNode,
  label: string,
  title: string,
  ariaLabel: string,
  disabled: boolean,
  onClick: () => void,
): ReactElement => (
  <button
    className={className}
    title={title}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    <span className="map-frame-control__button-icon" aria-hidden="true">
      {icon}
    </span>
    <span className="map-frame-control__button-label">{label}</span>
  </button>
);

const MapFrameControl = ({
  canZoomToMission,
  canZoomToVehicle,
  canZoomToHome,
  onZoomToMission,
  onZoomToVehicle,
  onZoomToHome,
  className,
}: MapFrameControlProps): ReactElement => {
  const controlClassName = buildClassName('map-frame-control', className);
  const controlStyle: FrameControlStyle = { '--frame-control-gap': '7px' };

  return (
    <div className={controlClassName} style={controlStyle} aria-label="Frame view controls">
      <div className="map-frame-control__header" aria-hidden="true">
        <span className="map-frame-control__header-title">Frame / View</span>
      </div>

      <div className="map-frame-control__stack">
        {renderButton(
          'map-frame-control__button',
          <Route size={14} strokeWidth={2.2} />,
          'Mission',
          'Zoom to mission',
          'Zoom to mission',
          !canZoomToMission,
          onZoomToMission,
        )}
        {renderButton(
          'map-frame-control__button',
          <LocateFixed size={14} strokeWidth={2.2} />,
          'Vehicle',
          'Zoom to vehicle',
          'Zoom to vehicle',
          !canZoomToVehicle,
          onZoomToVehicle,
        )}
        {renderButton(
          'map-frame-control__button',
          <Home size={14} strokeWidth={2.2} />,
          'Home',
          'Zoom to home',
          'Zoom to home',
          !canZoomToHome,
          onZoomToHome,
        )}
      </div>
    </div>
  );
};

export default MapFrameControl;
