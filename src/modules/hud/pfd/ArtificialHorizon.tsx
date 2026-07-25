/**
 * ArtificialHorizon.tsx
 *
 * PFD cell wrapper for the ArtificialHorizon canvas instrument.
 * Renders the center `pfd-cell--horizon` div that contains the canvas.
 * Displays in rectangular bezel mode (set by PrimaryFlightDisplay).
 *
 * Accepts optional children rendered as absolute overlays over the canvas
 * (e.g. NavigationOverlay — aircraft symbol, bearing pointer, XTE bar).
 */

import React from 'react';

interface ArtificialHorizonCellProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  children?: React.ReactNode;
}

const ArtificialHorizonCell: React.FC<ArtificialHorizonCellProps> = ({ canvasRef, children }) => (
  <div className="pfd-cell pfd-cell--horizon" style={{ position: 'relative' }}>
    <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} />
    {children}
  </div>
);

export default ArtificialHorizonCell;
