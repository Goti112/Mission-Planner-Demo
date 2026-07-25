/**
 * AltitudeTape.tsx
 *
 * PFD cell wrapper for the AltitudeTape canvas instrument.
 * Renders the right-of-center `pfd-cell--altitude` div containing the canvas.
 */

import React from 'react';

interface AltitudeTapeCellProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const AltitudeTapeCell: React.FC<AltitudeTapeCellProps> = ({ canvasRef }) => (
  <div className="pfd-cell pfd-cell--altitude">
    <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} />
  </div>
);

export default AltitudeTapeCell;
