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
      `${name} is required. Run "npm run setup" (or copy .env.example to .env.local) and provide a domain-restricted client token.`,
    );
  }
  return normalized;
};

const requirePublicMapboxToken = (value: string | undefined): string => {
  const token = requireValue('VITE_MAPBOX_TOKEN', value);
  if (!token.startsWith('pk.')) {
    throw new DemoEnvironmentError(
      'VITE_MAPBOX_TOKEN must be a public client token beginning with pk. Secret tokens must never be exposed to the browser.',
    );
  }

  return token;
};

export const readDemoEnvironment = (input: DemoEnvironmentInput): DemoEnvironment => ({
  mapboxToken: requirePublicMapboxToken(input.VITE_MAPBOX_TOKEN),
  cesiumIonToken: requireValue('VITE_CESIUM_ION_TOKEN', input.VITE_CESIUM_ION_TOKEN),
});
