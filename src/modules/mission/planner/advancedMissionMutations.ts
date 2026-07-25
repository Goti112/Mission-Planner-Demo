import type {
  AdvancedMissionPlan,
  FenceVertex,
  FenceDefinition,
  RallyPoint,
  SurveyGridSpec,
} from './advancedMissionTypes';
import { emptyAdvancedMissionPlan } from './advancedMissionTypes';
import { assertPolygonVertices, assertFenceVertex } from './advancedMissionGeometry';

type FenceMutationPatch<TFence extends FenceDefinition = FenceDefinition> = TFence extends FenceDefinition
  ? Partial<Omit<TFence, 'id' | 'shape'>>
  : never;

export class AdvancedMissionMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdvancedMissionMutationError';
  }
}

const findById = <T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
  label: string,
): T => {
  const item = items.find((candidate) => candidate.id === id);

  if (item === undefined) {
    throw new AdvancedMissionMutationError(`${label} ${id} was not found.`);
  }

  return item;
};

const assertUniqueId = <T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
  label: string,
): void => {
  if (items.some((item) => item.id === id)) {
    throw new AdvancedMissionMutationError(`${label} ${id} already exists.`);
  }
};

const assertMutationCoordinate = (
  vertex: FenceVertex,
  label: string,
): void => {
  try {
    assertFenceVertex(vertex, label);
  } catch (error) {
    if (error instanceof AdvancedMissionMutationError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new AdvancedMissionMutationError(error.message);
    }

    throw new AdvancedMissionMutationError(String(error));
  }
};

const validateFence = (fence: FenceDefinition): void => {
  if (fence.shape === 'polygon') {
    assertPolygonVertices(fence.vertices, `fence.${fence.id}.vertices`);
  } else {
    assertFenceVertex(fence.center, `fence.${fence.id}.center`);

    if (!Number.isFinite(fence.radiusM) || fence.radiusM <= 0) {
      throw new AdvancedMissionMutationError(`Circle fence ${fence.id} radius must be positive.`);
    }
  }
};

const validateRallyPoint = (rallyPoint: RallyPoint): void => {
  assertFenceVertex(rallyPoint.coordinate, `rally.${rallyPoint.id}.coordinate`);

  if (!Number.isFinite(rallyPoint.coordinate.alt) || rallyPoint.coordinate.alt < 0) {
    throw new AdvancedMissionMutationError(`Rally point ${rallyPoint.id} altitude must be greater than or equal to 0.`);
  }

  if (!Number.isFinite(rallyPoint.loiterAltitudeM) || rallyPoint.loiterAltitudeM < 0) {
    throw new AdvancedMissionMutationError(
      `Rally point ${rallyPoint.id} loiter altitude must be greater than or equal to 0.`,
    );
  }
};

const validateSurvey = (survey: SurveyGridSpec): void => {
  assertPolygonVertices(survey.polygon, `survey.${survey.id}.polygon`);

  if (!Number.isFinite(survey.laneSpacingM) || survey.laneSpacingM <= 0) {
    throw new AdvancedMissionMutationError(`Survey ${survey.id} lane spacing must be positive.`);
  }

  if (!Number.isFinite(survey.altitudeM) || survey.altitudeM < 0) {
    throw new AdvancedMissionMutationError(`Survey ${survey.id} altitude must be greater than or equal to 0.`);
  }
};

const findPolygonFenceVertices = (
  plan: AdvancedMissionPlan,
  fenceId: string,
): readonly FenceVertex[] => {
  const fence = findById(plan.fences, fenceId, 'Fence');

  if (fence.shape !== 'polygon') {
    throw new AdvancedMissionMutationError(`Fence ${fenceId} is not a polygon fence.`);
  }

  return fence.vertices;
};

const assertExistingFenceVertexIndex = (
  fenceId: string,
  vertices: readonly FenceVertex[],
  vertexIndex: number,
): void => {
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertices.length) {
    throw new AdvancedMissionMutationError(
      `Vertex ${vertexIndex.toString()} is out of range for polygon fence ${fenceId}; vertexCount=${vertices.length.toString()}.`,
    );
  }
};

export const normalizeAdvancedMissionPlan = (
  plan: AdvancedMissionPlan | null,
): AdvancedMissionPlan => plan ?? emptyAdvancedMissionPlan();

export const addFence = (
  plan: AdvancedMissionPlan,
  fence: FenceDefinition,
): AdvancedMissionPlan => {
  assertUniqueId(plan.fences, fence.id, 'Fence');
  validateFence(fence);

  return {
    ...plan,
    fences: [...plan.fences, fence],
  };
};

export const updateFence = (
  plan: AdvancedMissionPlan,
  fenceId: string,
  patch: FenceMutationPatch,
): AdvancedMissionPlan => {
  findById(plan.fences, fenceId, 'Fence');

  return {
    ...plan,
    fences: plan.fences.map((fence): FenceDefinition => {
      if (fence.id !== fenceId) {
        return fence;
      }

      const updated = { ...fence, ...patch } as FenceDefinition;
      validateFence(updated);

      return updated;
    }),
  };
};

export const removeFence = (
  plan: AdvancedMissionPlan,
  fenceId: string,
): AdvancedMissionPlan => {
  findById(plan.fences, fenceId, 'Fence');

  return {
    ...plan,
    fences: plan.fences.filter((fence) => fence.id !== fenceId),
  };
};

export const updatePolygonFenceVertex = (
  plan: AdvancedMissionPlan,
  fenceId: string,
  vertexIndex: number,
  vertex: FenceVertex,
): AdvancedMissionPlan => {
  const vertices = findPolygonFenceVertices(plan, fenceId);
  assertExistingFenceVertexIndex(fenceId, vertices, vertexIndex);
  assertMutationCoordinate(vertex, `fence.${fenceId}.vertices[${vertexIndex.toString()}]`);

  return updateFence(plan, fenceId, {
    vertices: vertices.map((currentVertex, index): FenceVertex =>
      index === vertexIndex ? { ...vertex } : currentVertex,
    ),
  });
};

export const insertPolygonFenceVertex = (
  plan: AdvancedMissionPlan,
  fenceId: string,
  afterVertexIndex: number,
  vertex: FenceVertex,
): AdvancedMissionPlan => {
  const vertices = findPolygonFenceVertices(plan, fenceId);
  assertExistingFenceVertexIndex(fenceId, vertices, afterVertexIndex);
  assertMutationCoordinate(vertex, `fence.${fenceId}.vertices[${(afterVertexIndex + 1).toString()}]`);

  return updateFence(plan, fenceId, {
    vertices: [
      ...vertices.slice(0, afterVertexIndex + 1),
      { ...vertex },
      ...vertices.slice(afterVertexIndex + 1),
    ],
  });
};

export const removePolygonFenceVertex = (
  plan: AdvancedMissionPlan,
  fenceId: string,
  vertexIndex: number,
): AdvancedMissionPlan => {
  const vertices = findPolygonFenceVertices(plan, fenceId);
  assertExistingFenceVertexIndex(fenceId, vertices, vertexIndex);

  if (vertices.length <= 3) {
    throw new AdvancedMissionMutationError(
      `Cannot remove vertex ${vertexIndex.toString()} from polygon fence ${fenceId} because a polygon fence requires at least 3 vertices.`,
    );
  }

  return updateFence(plan, fenceId, {
    vertices: vertices.filter((_, index) => index !== vertexIndex),
  });
};

export const addRallyPoint = (
  plan: AdvancedMissionPlan,
  rallyPoint: RallyPoint,
): AdvancedMissionPlan => {
  assertUniqueId(plan.rallyPoints, rallyPoint.id, 'Rally point');
  validateRallyPoint(rallyPoint);

  return {
    ...plan,
    rallyPoints: [...plan.rallyPoints, rallyPoint],
  };
};

export const updateRallyPoint = (
  plan: AdvancedMissionPlan,
  rallyPointId: string,
  patch: Partial<Omit<RallyPoint, 'id'>>,
): AdvancedMissionPlan => {
  findById(plan.rallyPoints, rallyPointId, 'Rally point');

  return {
    ...plan,
    rallyPoints: plan.rallyPoints.map((rallyPoint): RallyPoint => {
      if (rallyPoint.id !== rallyPointId) {
        return rallyPoint;
      }

      const updated = { ...rallyPoint, ...patch };
      validateRallyPoint(updated);

      return updated;
    }),
  };
};

export const updateRallyPointCoordinate = (
  plan: AdvancedMissionPlan,
  rallyPointId: string,
  coordinate: RallyPoint['coordinate'],
): AdvancedMissionPlan => {
  findById(plan.rallyPoints, rallyPointId, 'Rally point');
  assertMutationCoordinate(coordinate, `rally.${rallyPointId}.coordinate`);

  if (!Number.isFinite(coordinate.alt) || coordinate.alt < 0) {
    throw new AdvancedMissionMutationError(
      `Rally point ${rallyPointId} altitude must be greater than or equal to 0.`,
    );
  }

  return updateRallyPoint(plan, rallyPointId, {
    coordinate: { ...coordinate },
  });
};

export const removeRallyPoint = (
  plan: AdvancedMissionPlan,
  rallyPointId: string,
): AdvancedMissionPlan => {
  findById(plan.rallyPoints, rallyPointId, 'Rally point');

  return {
    ...plan,
    rallyPoints: plan.rallyPoints.filter((rallyPoint) => rallyPoint.id !== rallyPointId),
  };
};

export const addSurvey = (
  plan: AdvancedMissionPlan,
  survey: SurveyGridSpec,
): AdvancedMissionPlan => {
  assertUniqueId(plan.surveys, survey.id, 'Survey');
  validateSurvey(survey);

  return {
    ...plan,
    surveys: [...plan.surveys, survey],
  };
};

export const updateSurvey = (
  plan: AdvancedMissionPlan,
  surveyId: string,
  patch: Partial<Omit<SurveyGridSpec, 'id'>>,
): AdvancedMissionPlan => {
  findById(plan.surveys, surveyId, 'Survey');

  return {
    ...plan,
    surveys: plan.surveys.map((survey): SurveyGridSpec => {
      if (survey.id !== surveyId) {
        return survey;
      }

      const updated = { ...survey, ...patch };
      validateSurvey(updated);

      return updated;
    }),
  };
};

export const removeSurvey = (
  plan: AdvancedMissionPlan,
  surveyId: string,
): AdvancedMissionPlan => {
  findById(plan.surveys, surveyId, 'Survey');

  return {
    ...plan,
    surveys: plan.surveys.filter((survey) => survey.id !== surveyId),
  };
};
