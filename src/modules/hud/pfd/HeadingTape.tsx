/**
 * HeadingTape.tsx
 *
 * PFD cell wrapper for the HeadingTape canvas instrument.
 * Renders a `pfd-cell--heading` div that contains the canvas element.
 * The parent (PrimaryFlightDisplay) holds the canvas ref and manages
 * the instrument lifecycle and rAF loop.
 */

import React from 'react';

interface HeadingTapeCellProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const HeadingTapeCell: React.FC<HeadingTapeCellProps> = ({ canvasRef }) => (
  <div className="pfd-cell pfd-cell--heading">
    <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} />
  </div>
);

export default HeadingTapeCell;
