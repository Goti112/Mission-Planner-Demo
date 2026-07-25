import * as Cesium from 'cesium';
import { getColorFromMSL } from '../../../shared/utils/altitudeColors';

interface TrailCurtainMaterialUniforms {
  colorRamp: string | HTMLCanvasElement;
}

interface TrailCurtainMaterialFabric {
  type: string;
  source: string;
  uniforms: TrailCurtainMaterialUniforms;
}

interface TrailCurtainMaterialTemplate {
  fabric: TrailCurtainMaterialFabric;
  translucent: boolean;
}

interface TrailCurtainMaterialCache {
  addMaterial: (type: string, materialTemplate: TrailCurtainMaterialTemplate) => void;
}

interface CesiumMaterialWithCache {
  readonly DefaultImageId: string;
  readonly _materialCache: TrailCurtainMaterialCache;
}

export interface PrimitiveCollectionLike<TPrimitive> {
  add: (primitive: TPrimitive) => TPrimitive;
  remove: (primitive: TPrimitive) => boolean;
}

function getCesiumMaterialWithCache(): CesiumMaterialWithCache {
  return Cesium.Material as unknown as CesiumMaterialWithCache;
}

function registerTrailCurtainMaterialTemplate(materialType: string, source: string): void {
  const material = getCesiumMaterialWithCache();
  material._materialCache.addMaterial(materialType, {
    fabric: {
      type: materialType,
      source,
      uniforms: {
        colorRamp: material.DefaultImageId,
      },
    },
    translucent: true,
  });
}

export function createTrailCurtainMaterial(
  materialType: string,
  source: string,
  colorRamp: HTMLCanvasElement,
): Cesium.Material {
  registerTrailCurtainMaterialTemplate(materialType, source);

  return Cesium.Material.fromType(materialType, { colorRamp });
}

export function createTrailCurtainTextureCanvas(
  altitudes: readonly number[],
  count: number,
  createCanvas: () => HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = createCanvas();
  canvas.width = count;
  canvas.height = 1;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Trail curtain color ramp canvas could not create a 2D context.');
  }

  const imageData = context.createImageData(count, 1);
  const data = imageData.data;
  for (let i = 0; i < count; i++) {
    const color = getColorFromMSL(altitudes[i]);
    const offset = i * 4;
    data[offset] = color.r | 0;
    data[offset + 1] = color.g | 0;
    data[offset + 2] = color.b | 0;
    data[offset + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);

  return canvas;
}

export function replaceTrailCurtainPrimitive<TPrimitive>(
  primitives: PrimitiveCollectionLike<TPrimitive>,
  nextPrimitive: TPrimitive,
  previousPrimitive: TPrimitive | null,
): void {
  primitives.add(nextPrimitive);
  if (previousPrimitive !== null) {
    primitives.remove(previousPrimitive);
  }
}

export function queueTrailCurtainPrimitiveReplacement<TPrimitive>(
  primitives: PrimitiveCollectionLike<TPrimitive>,
  pendingRemovalPrimitives: TPrimitive[],
  nextPrimitive: TPrimitive,
  previousPrimitive: TPrimitive | null,
): void {
  primitives.add(nextPrimitive);
  if (previousPrimitive !== null) {
    pendingRemovalPrimitives.push(previousPrimitive);
  }
}

export function removeQueuedTrailCurtainPrimitives<TPrimitive>(
  primitives: PrimitiveCollectionLike<TPrimitive>,
  pendingRemovalPrimitives: TPrimitive[],
): void {
  const pendingPrimitives = pendingRemovalPrimitives.splice(0, pendingRemovalPrimitives.length);
  for (const primitive of pendingPrimitives) {
    primitives.remove(primitive);
  }
}
