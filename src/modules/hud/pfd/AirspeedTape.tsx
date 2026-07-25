/**
 * AirspeedTape.tsx
 *
 * PFD cell wrapper for the SpeedTape canvas instrument.
 * Renders the left-column `pfd-cell--speed` div that contains the canvas.
 */

import React from 'react';

interface AirspeedTapeCellProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const AirspeedTapeCell: React.FC<AirspeedTapeCellProps> = ({ canvasRef }) => (
  <div className="pfd-cell pfd-cell--speed">
    <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} />
  </div>
);

export default AirspeedTapeCell;
