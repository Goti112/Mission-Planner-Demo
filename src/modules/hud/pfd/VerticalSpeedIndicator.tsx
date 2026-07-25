/**
 * VerticalSpeedIndicator.tsx
 *
 * PFD cell wrapper for the VerticalSpeedIndicator canvas instrument.
 * Renders the far-right thin `pfd-cell--vsi` column that contains the canvas.
 */

import React from 'react';

interface VerticalSpeedIndicatorCellProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const VerticalSpeedIndicatorCell: React.FC<VerticalSpeedIndicatorCellProps> = ({ canvasRef }) => (
  <div className="pfd-cell pfd-cell--vsi">
    <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} />
  </div>
);

export default VerticalSpeedIndicatorCell;
