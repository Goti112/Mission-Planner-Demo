/**
 * useSmoothing.ts
 *
 * Hook que crea y mantiene una instancia de SmoothingEngine por HUD mount.
 * La instancia persiste entre renders (useRef) para conservar el estado EMA.
 *
 * @param config   Configuración opcional de factores α.
 * @returns        Instancia estable de SmoothingEngine.
 */

import { useState } from 'react';
import { SmoothingEngine, DEFAULT_SMOOTHING_CONFIG } from '../core/SmoothingEngine';
import type { SmoothingConfig } from '../core/SmoothingEngine';

export function useSmoothing(config?: Partial<SmoothingConfig>): SmoothingEngine {
  // useState con inicializador lazy: la factory se ejecuta solo en el primer mount,
  // nunca en re-renders. Evita acceder a .current durante el render (React Compiler).
  const [smoother] = useState<SmoothingEngine>(
    () => new SmoothingEngine(
      config ? { ...DEFAULT_SMOOTHING_CONFIG, ...config } : undefined
    )
  );

  return smoother;
}
