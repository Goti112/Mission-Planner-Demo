import type { CSSProperties, FC } from 'react'

import './AircraftMarker.css'
import { PUBLIC_ASSET_URLS } from '../../../shared/utils/publicAssetUrl'

const AIRCRAFT_SPRITE_SRC = PUBLIC_ASSET_URLS.aircraftMarker

interface AircraftMarkerProps {
  size?: number
  rotation?: number
  active?: boolean
}

const AircraftMarker: FC<AircraftMarkerProps> = ({
  size = 46,
  rotation = 0,
  active = false,
}) => {
  const className = active
    ? 'aircraft-marker aircraft-marker--active'
    : 'aircraft-marker'

  return (
    <div
      className={className}
      style={{
        '--aircraft-size': `${size}px`,
        '--aircraft-rotation': `${rotation}deg`,
      } as CSSProperties}
      aria-label={active ? 'Active aircraft marker' : 'Aircraft marker'}
      role="img"
    >
      <span className="aircraft-marker__heading" aria-hidden="true" />
      <span className="aircraft-marker__shadow" aria-hidden="true" />
      <img
        className="aircraft-marker__sprite"
        src={AIRCRAFT_SPRITE_SRC}
        alt=""
        draggable={false}
      />
    </div>
  )
}

export default AircraftMarker
