import { describe, it, expect } from 'vitest';
import {
  INTERP_PREDICT_CAP_MS,
  INTERP_HISTORY_DEPTH,
  INTERP_PREDICT_BEYOND_LAST,
} from '../../../../shared/config/interpolationConfig';

describe('interpolationConfig — valores de tuning', () => {
  it('INTERP_PREDICT_CAP_MS debe ser 200ms para cubrir GPS 10Hz + 100ms headroom', () => {
    // GPS llega cada 100ms. Con 150ms el cap es solo 50ms de headroom.
    // Con 200ms ganamos 100ms de headroom — elimina micro-stutters en GPS lento.
    expect(INTERP_PREDICT_CAP_MS).toBe(200);
  });

  it('INTERP_HISTORY_DEPTH debe ser 4 (requerido para Catmull-Rom)', () => {
    expect(INTERP_HISTORY_DEPTH).toBe(4);
  });

  it('INTERP_PREDICT_BEYOND_LAST debe estar habilitado', () => {
    expect(INTERP_PREDICT_BEYOND_LAST).toBe(true);
  });
});
