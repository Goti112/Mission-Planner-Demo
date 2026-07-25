export type CesiumDiagnosticLevel = 'info' | 'warning' | 'error'

export type CesiumDiagnosticCode =
  | 'ion-token-missing'
  | 'terrain-sampling-failed'
  | 'waypoint-terrain-sampling-failed'
  | 'home-terrain-sampling-failed'
  | 'tileset-load-failed'
  | 'terrain-provider-load-failed'
  | 'replay-source-empty'

export type CesiumDiagnosticContext = Record<string, string | number | boolean | null>

export interface SerializedCesiumError {
  name: string
  message: string
  stack: string | null
}

export interface CreateCesiumDiagnosticInput {
  level: CesiumDiagnosticLevel
  code: CesiumDiagnosticCode
  message: string
  context: CesiumDiagnosticContext
  error: unknown
}

export interface CesiumDiagnostic {
  level: CesiumDiagnosticLevel
  code: CesiumDiagnosticCode
  message: string
  context: CesiumDiagnosticContext
  error: SerializedCesiumError | null
}

export const resolveCesiumIonToken = (rawToken: string | undefined): string | null => {
  if (rawToken === undefined) return null
  const token = rawToken.trim()
  return token.length > 0 ? token : null
}

const isCesiumRequestError = (value: unknown): value is { statusCode: number; response: string } =>
  typeof value === 'object' &&
  value !== null &&
  'statusCode' in value &&
  typeof (value as Record<string, unknown>).statusCode === 'number' &&
  'response' in value &&
  typeof (value as Record<string, unknown>).response === 'string'

export const serializeCesiumError = (error: unknown): SerializedCesiumError => {
  if (isCesiumRequestError(error)) {
    return {
      name: 'CesiumRequestError',
      message: `HTTP ${error.statusCode}: ${error.response}`,
      stack: null,
    }
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
    stack: null,
  }
}

export const createCesiumDiagnostic = (
  input: CreateCesiumDiagnosticInput,
): CesiumDiagnostic => ({
  level: input.level,
  code: input.code,
  message: input.message,
  context: input.context,
  error: input.error === null ? null : serializeCesiumError(input.error),
})

export const logCesiumDiagnostic = (diagnostic: CesiumDiagnostic): void => {
  const fields = {
    code: diagnostic.code,
    context: diagnostic.context,
    error: diagnostic.error,
  }

  if (diagnostic.level === 'error') {
    console.error(diagnostic.message, fields)
    return
  }

  if (diagnostic.level === 'warning') {
    console.warn(diagnostic.message, fields)
    return
  }

  console.info(diagnostic.message, fields)
}
