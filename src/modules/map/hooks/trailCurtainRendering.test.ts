import * as Cesium from 'cesium';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTrailCurtainMaterial,
  createTrailCurtainTextureCanvas,
  queueTrailCurtainPrimitiveReplacement,
  removeQueuedTrailCurtainPrimitives,
  replaceTrailCurtainPrimitive,
  type PrimitiveCollectionLike,
} from './trailCurtainRendering';

interface FakeImageData {
  data: Uint8ClampedArray;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function createFakeCanvas(): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  imageData: FakeImageData;
} {
  const imageData: FakeImageData = {
    data: new Uint8ClampedArray(8),
  };
  const context = {
    createImageData: vi.fn(() => imageData),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;

  return { canvas, context, imageData };
}

describe('trail curtain rendering', () => {
  it('applies DOM texture sources after Cesium clones the cached material template', () => {
    const fromType = vi.spyOn(Cesium.Material, 'fromType');
    const materialType = 'TrailCurtainRenderingFromTypeTestMaterial';
    const source = 'uniform sampler2D colorRamp; czm_material czm_getMaterial(czm_materialInput materialInput) { return czm_getDefaultMaterial(materialInput); }';
    const canvas = document.createElement('canvas');

    createTrailCurtainMaterial(materialType, source, canvas);

    expect(fromType).toHaveBeenCalledWith(materialType, { colorRamp: canvas });
  });

  it('creates Cesium materials repeatedly without caching DOM texture sources', () => {
    if (typeof globalThis.ImageBitmap === 'undefined') {
      Object.defineProperty(globalThis, 'ImageBitmap', {
        value: class ImageBitmap {},
        configurable: true,
      });
    }
    if (typeof globalThis.OffscreenCanvas === 'undefined') {
      Object.defineProperty(globalThis, 'OffscreenCanvas', {
        value: class OffscreenCanvas {},
        configurable: true,
      });
    }

    const materialType = 'TrailCurtainRenderingTestMaterial';
    const source = 'uniform sampler2D colorRamp; czm_material czm_getMaterial(czm_materialInput materialInput) { czm_material material = czm_getDefaultMaterial(materialInput); material.diffuse = texture(colorRamp, vec2(0.5)).rgb; return material; }';
    const firstCanvas = document.createElement('canvas');
    const secondCanvas = document.createElement('canvas');

    const firstMaterial = createTrailCurtainMaterial(materialType, source, firstCanvas);
    const secondMaterial = createTrailCurtainMaterial(materialType, source, secondCanvas);

    expect(firstMaterial.uniforms.colorRamp).toBe(firstCanvas);
    expect(secondMaterial.uniforms.colorRamp).toBe(secondCanvas);
  });

  it('creates a synchronous canvas texture source for the altitude color ramp', () => {
    const { canvas, context, imageData } = createFakeCanvas();

    const textureSource = createTrailCurtainTextureCanvas([0, 100], 2, () => canvas);

    expect(textureSource).toBe(canvas);
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(context.createImageData).toHaveBeenCalledWith(2, 1);
    expect(context.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
    expect(Array.from(imageData.data.filter((_, index) => index % 4 === 3))).toEqual([255, 255]);
  });

  it('adds the new primitive before removing the previous one', () => {
    const calls: string[] = [];
    const primitives: PrimitiveCollectionLike<string> = {
      add: (primitive) => {
        calls.push(`add:${primitive}`);
        return primitive;
      },
      remove: (primitive) => {
        calls.push(`remove:${primitive}`);
        return true;
      },
    };

    replaceTrailCurtainPrimitive(primitives, 'next', 'previous');

    expect(calls).toEqual(['add:next', 'remove:previous']);
  });

  it('can defer previous primitive removal until the next rendered frame', () => {
    const calls: string[] = [];
    const pendingRemovalPrimitives: string[] = [];
    const primitives: PrimitiveCollectionLike<string> = {
      add: (primitive) => {
        calls.push(`add:${primitive}`);
        return primitive;
      },
      remove: (primitive) => {
        calls.push(`remove:${primitive}`);
        return true;
      },
    };

    queueTrailCurtainPrimitiveReplacement(
      primitives,
      pendingRemovalPrimitives,
      'next',
      'previous',
    );

    expect(calls).toEqual(['add:next']);
    expect(pendingRemovalPrimitives).toEqual(['previous']);

    removeQueuedTrailCurtainPrimitives(primitives, pendingRemovalPrimitives);

    expect(calls).toEqual(['add:next', 'remove:previous']);
    expect(pendingRemovalPrimitives).toEqual([]);
  });
});
