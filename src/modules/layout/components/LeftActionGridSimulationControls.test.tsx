import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import LeftActionGrid from './LeftActionGrid';

describe('LeftActionGrid simulation controls', () => {
  it('offers telemetry, preflight, and system status without live controls', () => {
    const html = renderToStaticMarkup(
      <LeftActionGrid
        activeButton="Telem"
        onActivate={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Ver telemetría del dron" aria-pressed="true"');
    expect(html).toContain('aria-label="Comprobaciones previas"');
    expect(html).toContain('aria-label="Estado del sistema"');
    expect(html).not.toContain('Controles de vuelo');
    expect(html).not.toContain('Cámara virtual');
    expect(html).not.toContain('Cámara real');
  });
});
