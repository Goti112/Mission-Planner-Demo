import type { ReactNode } from 'react';
import { readDemoEnvironment } from '../config/demoEnvironment';

interface DemoEnvironmentGateProps {
  readonly children: ReactNode;
}

export function DemoEnvironmentGate({ children }: DemoEnvironmentGateProps): ReactNode {
  readDemoEnvironment({
    VITE_MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN,
    VITE_CESIUM_ION_TOKEN: import.meta.env.VITE_CESIUM_ION_TOKEN,
  });
  return children;
}
