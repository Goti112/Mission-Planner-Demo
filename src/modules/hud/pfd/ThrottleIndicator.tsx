/**
 * ThrottleIndicator.tsx
 *
 * PFD cell wrapper for the ThrottleIndicator canvas instrument.
 * Renders the compact left-side `pfd-cell--throttle` rail.
 */

import React from 'react';

interface ThrottleIndicatorCellProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const ThrottleIndicatorCell: React.FC<ThrottleIndicatorCellProps> = ({ canvasRef }) => (
  <div className="pfd-cell pfd-cell--throttle">
    <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} />
  </div>
);

export default ThrottleIndicatorCell;
