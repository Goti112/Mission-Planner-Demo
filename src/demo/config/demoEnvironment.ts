export interface DemoEnvironmentInput {
  readonly VITE_MAPBOX_TOKEN: string | undefined;
  readonly VITE_CESIUM_ION_TOKEN: string | undefined;
}

export interface DemoEnvironment {
  readonly mapboxToken: string;
  readonly cesiumIonToken: string;
}

export class DemoEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoEnvironmentError';
  }
}

const requireValue = (name: keyof DemoEnvironmentInput, value: string | undefined): string => {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) {
    throw new DemoEnvironmentError(
      `${name} is required. Copy .env.example to .env.local and provide a domain-restricted client token.`,
    );
  }
  return normalized;
};

export const readDemoEnvironment = (input: DemoEnvironmentInput): DemoEnvironment => ({
  mapboxToken: requireValue('VITE_MAPBOX_TOKEN', input.VITE_MAPBOX_TOKEN),
  cesiumIonToken: requireValue('VITE_CESIUM_ION_TOKEN', input.VITE_CESIUM_ION_TOKEN),
});
