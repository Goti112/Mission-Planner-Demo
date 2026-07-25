import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

const ASSET_COPYRIGHT = 'Copyright © 2026 Goti112. Original RohuPlanner portfolio asset.';
const LOGO_PATH = new URL('../public/Logo.svg', import.meta.url);
const MARKER_PATH = new URL('../public/assets/aircraft-marker.png', import.meta.url);
const MODEL_PATH = new URL('../public/assets/drone.glb', import.meta.url);

const createLogoSvg = (): string => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="300" viewBox="0 0 960 300" role="img" aria-labelledby="title description">
  <title id="title">RohuPlanner</title>
  <desc id="description">An original route and aircraft mark beside the RohuPlanner wordmark.</desc>
  <metadata>${ASSET_COPYRIGHT}</metadata>
  <rect width="960" height="300" rx="44" fill="#071018"/>
  <g transform="translate(58 48)">
    <path d="M32 157 C78 94 116 108 151 64 C176 32 209 30 246 51" fill="none" stroke="#22d3ee" stroke-width="13" stroke-linecap="round" stroke-dasharray="2 27"/>
    <circle cx="32" cy="157" r="20" fill="#071018" stroke="#38bdf8" stroke-width="10"/>
    <circle cx="246" cy="51" r="20" fill="#071018" stroke="#22d3ee" stroke-width="10"/>
    <g transform="translate(143 80) rotate(36)">
      <path d="M0 -54 L15 -8 L58 12 L58 26 L15 20 L7 58 L-7 58 L-15 20 L-58 26 L-58 12 L-15 -8 Z" fill="#f8fafc" stroke="#0ea5e9" stroke-width="5" stroke-linejoin="round"/>
    </g>
  </g>
  <text x="350" y="142" fill="#f8fafc" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="76" font-weight="760" letter-spacing="-2">RohuPlanner</text>
  <text x="354" y="195" fill="#94a3b8" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="25" font-weight="560" letter-spacing="5">MISSION CONTROL · SIMULATION</text>
</svg>
`;

const createCrcTable = (): Uint32Array => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
};

const CRC_TABLE = createCrcTable();

const calculateCrc32 = (input: Buffer): number => {
  let crc = 0xffffffff;

  for (const value of input) {
    crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const createPngChunk = (type: string, data: Buffer): Buffer => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const result = Buffer.alloc(12 + data.length);

  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(calculateCrc32(crcInput), 8 + data.length);

  return result;
};

interface RasterPoint {
  readonly x: number;
  readonly y: number;
}

interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const isPointInPolygon = (point: RasterPoint, polygon: readonly RasterPoint[]): boolean => {
  let inside = false;

  for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];
    const crosses = (current.y > point.y) !== (previous.y > point.y)
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;

    if (crosses) {
      inside = !inside;
    }
  }

  return inside;
};

const blendPixel = (
  pixels: Uint8Array,
  size: number,
  x: number,
  y: number,
  color: RgbaColor,
): void => {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const offset = (y * size + x) * 4;
  const alpha = color.a / 255;
  const inverseAlpha = 1 - alpha;

  pixels[offset] = Math.round(color.r * alpha + pixels[offset] * inverseAlpha);
  pixels[offset + 1] = Math.round(color.g * alpha + pixels[offset + 1] * inverseAlpha);
  pixels[offset + 2] = Math.round(color.b * alpha + pixels[offset + 2] * inverseAlpha);
  pixels[offset + 3] = Math.round(color.a + pixels[offset + 3] * inverseAlpha);
};

const fillPolygon = (
  pixels: Uint8Array,
  size: number,
  polygon: readonly RasterPoint[],
  color: RgbaColor,
): void => {
  const minimumX = Math.floor(Math.min(...polygon.map((point) => point.x)));
  const maximumX = Math.ceil(Math.max(...polygon.map((point) => point.x)));
  const minimumY = Math.floor(Math.min(...polygon.map((point) => point.y)));
  const maximumY = Math.ceil(Math.max(...polygon.map((point) => point.y)));

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      if (isPointInPolygon({ x: x + 0.5, y: y + 0.5 }, polygon)) {
        blendPixel(pixels, size, x, y, color);
      }
    }
  }
};

const fillCircle = (
  pixels: Uint8Array,
  size: number,
  center: RasterPoint,
  radius: number,
  color: RgbaColor,
): void => {
  const minimumX = Math.floor(center.x - radius);
  const maximumX = Math.ceil(center.x + radius);
  const minimumY = Math.floor(center.y - radius);
  const maximumY = Math.ceil(center.y + radius);
  const squaredRadius = radius * radius;

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const offsetX = x + 0.5 - center.x;
      const offsetY = y + 0.5 - center.y;

      if (offsetX * offsetX + offsetY * offsetY <= squaredRadius) {
        blendPixel(pixels, size, x, y, color);
      }
    }
  }
};

const downsampleRgba = (source: Uint8Array, sourceSize: number, outputSize: number): Uint8Array => {
  const scale = sourceSize / outputSize;
  const result = new Uint8Array(outputSize * outputSize * 4);

  for (let outputY = 0; outputY < outputSize; outputY += 1) {
    for (let outputX = 0; outputX < outputSize; outputX += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        let total = 0;

        for (let sampleY = 0; sampleY < scale; sampleY += 1) {
          for (let sampleX = 0; sampleX < scale; sampleX += 1) {
            const sourceX = outputX * scale + sampleX;
            const sourceY = outputY * scale + sampleY;
            total += source[(sourceY * sourceSize + sourceX) * 4 + channel];
          }
        }

        result[(outputY * outputSize + outputX) * 4 + channel] = Math.round(total / (scale * scale));
      }
    }
  }

  return result;
};

const encodePng = (pixels: Uint8Array, width: number, height: number): Buffer => {
  const scanlineSize = width * 4 + 1;
  const scanlines = Buffer.alloc(scanlineSize * height);

  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * scanlineSize;
    scanlines[scanlineOffset] = 0;
    Buffer.from(pixels.subarray(y * width * 4, (y + 1) * width * 4)).copy(scanlines, scanlineOffset + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const textData = Buffer.from(`Copyright\0${ASSET_COPYRIGHT}`, 'latin1');

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk('IHDR', header),
    createPngChunk('tEXt', textData),
    createPngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const createAircraftMarkerPng = (): Buffer => {
  const outputSize = 256;
  const scale = 4;
  const sourceSize = outputSize * scale;
  const pixels = new Uint8Array(sourceSize * sourceSize * 4);
  const multiplyPoints = (points: readonly RasterPoint[]): readonly RasterPoint[] => points.map((point) => ({
    x: point.x * scale,
    y: point.y * scale,
  }));
  const shadow = multiplyPoints([
    { x: 128, y: 13 }, { x: 151, y: 91 }, { x: 232, y: 130 }, { x: 232, y: 153 },
    { x: 154, y: 142 }, { x: 144, y: 215 }, { x: 112, y: 215 }, { x: 102, y: 142 },
    { x: 24, y: 153 }, { x: 24, y: 130 }, { x: 105, y: 91 },
  ]);
  const aircraft = multiplyPoints([
    { x: 128, y: 18 }, { x: 147, y: 96 }, { x: 225, y: 133 }, { x: 225, y: 146 },
    { x: 151, y: 136 }, { x: 141, y: 208 }, { x: 115, y: 208 }, { x: 105, y: 136 },
    { x: 31, y: 146 }, { x: 31, y: 133 }, { x: 109, y: 96 },
  ]);

  fillCircle(pixels, sourceSize, { x: 128 * scale, y: 128 * scale }, 112 * scale, {
    r: 2, g: 8, b: 15, a: 184,
  });
  fillCircle(pixels, sourceSize, { x: 128 * scale, y: 128 * scale }, 105 * scale, {
    r: 8, g: 23, b: 34, a: 226,
  });
  fillPolygon(pixels, sourceSize, shadow, { r: 0, g: 0, b: 0, a: 148 });
  fillPolygon(pixels, sourceSize, aircraft, { r: 248, g: 250, b: 252, a: 255 });
  fillPolygon(pixels, sourceSize, multiplyPoints([
    { x: 128, y: 18 }, { x: 147, y: 96 }, { x: 128, y: 118 }, { x: 109, y: 96 },
  ]), { r: 34, g: 211, b: 238, a: 255 });
  fillCircle(pixels, sourceSize, { x: 128 * scale, y: 128 * scale }, 9 * scale, {
    r: 14, g: 165, b: 233, a: 255,
  });

  return encodePng(downsampleRgba(pixels, sourceSize, outputSize), outputSize, outputSize);
};

interface ModelVertex {
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly color: readonly [number, number, number, number];
}

interface ModelGeometry {
  readonly vertices: readonly ModelVertex[];
  readonly indices: readonly number[];
}

interface ModelBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: readonly [number, number, number, number];
}

const createBoxGeometry = (box: ModelBox): ModelGeometry => {
  const [centerX, centerY, centerZ] = box.center;
  const [halfX, halfY, halfZ] = box.size.map((value) => value / 2);
  const faces = [
    { normal: [1, 0, 0], corners: [[halfX, -halfY, -halfZ], [halfX, halfY, -halfZ], [halfX, halfY, halfZ], [halfX, -halfY, halfZ]] },
    { normal: [-1, 0, 0], corners: [[-halfX, halfY, -halfZ], [-halfX, -halfY, -halfZ], [-halfX, -halfY, halfZ], [-halfX, halfY, halfZ]] },
    { normal: [0, 1, 0], corners: [[-halfX, halfY, -halfZ], [halfX, halfY, -halfZ], [halfX, halfY, halfZ], [-halfX, halfY, halfZ]] },
    { normal: [0, -1, 0], corners: [[halfX, -halfY, -halfZ], [-halfX, -halfY, -halfZ], [-halfX, -halfY, halfZ], [halfX, -halfY, halfZ]] },
    { normal: [0, 0, 1], corners: [[-halfX, -halfY, halfZ], [halfX, -halfY, halfZ], [halfX, halfY, halfZ], [-halfX, halfY, halfZ]] },
    { normal: [0, 0, -1], corners: [[-halfX, halfY, -halfZ], [halfX, halfY, -halfZ], [halfX, -halfY, -halfZ], [-halfX, -halfY, -halfZ]] },
  ];
  const vertices = faces.flatMap((face) => face.corners.map((corner) => ({
    position: [centerX + corner[0], centerY + corner[1], centerZ + corner[2]],
    normal: face.normal,
    color: box.color,
  })));
  const indices = faces.flatMap((_, faceIndex) => {
    const start = faceIndex * 4;
    return [start, start + 1, start + 2, start, start + 2, start + 3];
  });

  return { vertices, indices };
};

const combineGeometry = (parts: readonly ModelGeometry[]): ModelGeometry => {
  const vertices: ModelVertex[] = [];
  const indices: number[] = [];

  for (const part of parts) {
    const indexOffset = vertices.length;
    vertices.push(...part.vertices);
    indices.push(...part.indices.map((index) => index + indexOffset));
  }

  return { vertices, indices };
};

const alignBuffer = (buffer: Buffer): Buffer => {
  const remainder = buffer.length % 4;

  return remainder === 0
    ? buffer
    : Buffer.concat([buffer, Buffer.alloc(4 - remainder)]);
};

const alignJsonBuffer = (buffer: Buffer): Buffer => {
  const remainder = buffer.length % 4;

  return remainder === 0
    ? buffer
    : Buffer.concat([buffer, Buffer.alloc(4 - remainder, 0x20)]);
};

const createDroneModelGlb = (): Buffer => {
  const white: readonly [number, number, number, number] = [240, 249, 255, 255];
  const cyan: readonly [number, number, number, number] = [34, 211, 238, 255];
  const navy: readonly [number, number, number, number] = [8, 47, 73, 255];
  const geometry = combineGeometry([
    createBoxGeometry({ center: [0, 0, 0], size: [3.4, 0.65, 0.65], color: white }),
    createBoxGeometry({ center: [-0.15, 0, 0], size: [0.75, 5.8, 0.18], color: cyan }),
    createBoxGeometry({ center: [-1.35, 0, 0.42], size: [0.65, 2.15, 0.14], color: white }),
    createBoxGeometry({ center: [-1.52, 0, 0.9], size: [0.35, 0.14, 1.35], color: cyan }),
    createBoxGeometry({ center: [1.73, 0, 0], size: [0.22, 1.25, 0.16], color: navy }),
    createBoxGeometry({ center: [0.45, 0, 0.45], size: [0.7, 0.48, 0.35], color: navy }),
  ]);
  const positions = Buffer.alloc(geometry.vertices.length * 3 * 4);
  const normals = Buffer.alloc(geometry.vertices.length * 3 * 4);
  const colors = Buffer.alloc(geometry.vertices.length * 4);
  const indices = Buffer.alloc(geometry.indices.length * 2);

  geometry.vertices.forEach((vertex, vertexIndex) => {
    vertex.position.forEach((value, componentIndex) => {
      positions.writeFloatLE(value, (vertexIndex * 3 + componentIndex) * 4);
    });
    vertex.normal.forEach((value, componentIndex) => {
      normals.writeFloatLE(value, (vertexIndex * 3 + componentIndex) * 4);
    });
    vertex.color.forEach((value, componentIndex) => {
      colors[vertexIndex * 4 + componentIndex] = value;
    });
  });
  geometry.indices.forEach((index, indexPosition) => {
    indices.writeUInt16LE(index, indexPosition * 2);
  });

  const alignedPositions = alignBuffer(positions);
  const alignedNormals = alignBuffer(normals);
  const alignedColors = alignBuffer(colors);
  const alignedIndices = alignBuffer(indices);
  const binary = Buffer.concat([alignedPositions, alignedNormals, alignedColors, alignedIndices]);
  const positionValues = geometry.vertices.flatMap((vertex) => vertex.position);
  const minimum = [0, 1, 2].map((component) => Math.min(...geometry.vertices.map((vertex) => vertex.position[component])));
  const maximum = [0, 1, 2].map((component) => Math.max(...geometry.vertices.map((vertex) => vertex.position[component])));
  const json = {
    asset: {
      version: '2.0',
      generator: 'RohuPlanner scripts/generate-original-assets.ts',
      copyright: ASSET_COPYRIGHT,
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'RohuPlanner original fixed-wing aircraft' }],
    meshes: [{
      name: 'RohuPlanner aircraft',
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [{
      name: 'Vertex colors',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0.05,
        roughnessFactor: 0.72,
      },
      doubleSided: false,
    }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: alignedPositions.length, byteLength: normals.length, target: 34962 },
      { buffer: 0, byteOffset: alignedPositions.length + alignedNormals.length, byteLength: colors.length, target: 34962 },
      { buffer: 0, byteOffset: alignedPositions.length + alignedNormals.length + alignedColors.length, byteLength: indices.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: geometry.vertices.length, type: 'VEC3', min: minimum, max: maximum },
      { bufferView: 1, componentType: 5126, count: geometry.vertices.length, type: 'VEC3' },
      { bufferView: 2, componentType: 5121, count: geometry.vertices.length, type: 'VEC4', normalized: true },
      { bufferView: 3, componentType: 5123, count: geometry.indices.length, type: 'SCALAR' },
    ],
    extras: {
      provenance: 'Original procedural model created for RohuPlanner; reproducible from scripts/generate-original-assets.ts.',
      positionValueCount: positionValues.length,
    },
  };
  const jsonChunk = alignJsonBuffer(Buffer.from(JSON.stringify(json), 'utf8'));
  const header = Buffer.alloc(12);
  const jsonHeader = Buffer.alloc(8);
  const binaryHeader = Buffer.alloc(8);
  const totalLength = header.length + jsonHeader.length + jsonChunk.length + binaryHeader.length + binary.length;

  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.write('BIN\0', 4, 'ascii');

  return Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binary]);
};

const writeAssets = async (): Promise<void> => {
  await Promise.all([
    writeFile(LOGO_PATH, createLogoSvg(), 'utf8'),
    writeFile(MARKER_PATH, createAircraftMarkerPng()),
    writeFile(MODEL_PATH, createDroneModelGlb()),
  ]);
};

await writeAssets();
