import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const terrainDir = join(repoRoot, 'public', 'territory_map');
const authoredDir = join(repoRoot, 'assets', 'territory_map', 'transitions');

const FRAME_WIDTH = 113;
const FRAME_HEIGHT = 192;
const FRAME_GUTTER = 2;
const FRAME_CELL_WIDTH = FRAME_WIDTH + FRAME_GUTTER * 2;
const FRAME_CELL_HEIGHT = FRAME_HEIGHT + FRAME_GUTTER * 2;
const ATLAS_COLUMNS = 12;
const SIDES = 6;
const FOOTPRINT_TOP = 123 / 2;
const FOOTPRINT_BOTTOM = FRAME_HEIGHT;
const PIVOT_X = FRAME_WIDTH / 2;
const PIVOT_Y = FOOTPRINT_TOP + (FOOTPRINT_BOTTOM - FOOTPRINT_TOP) / 2;
const RADIUS_Y = (FOOTPRINT_BOTTOM - FOOTPRINT_TOP) / 2;
const RADIUS_X = FRAME_WIDTH / Math.sqrt(3);
const HEX_APOTHEM = Math.sqrt(3) / 2;

const sources = [
  ['grassland', join(terrainDir, 'grassland.webp')],
  ['grasslandAlt', join(terrainDir, 'grassland-alt.webp')],
  ['woodlands', join(terrainDir, 'woodlands.webp')],
  ['highland', join(terrainDir, 'highland.webp')],
  ['highlandAlt', join(terrainDir, 'highland-alt.webp')],
  ['marsh', join(terrainDir, 'marsh.webp')],
  ['marshAlt', join(terrainDir, 'marsh-alt.webp')],
  ['marshBog', join(terrainDir, 'marsh-bog.webp')],
  ['snowfield', join(terrainDir, 'snowfield.webp')],
  ['snowfieldAlt', join(terrainDir, 'snowfield-alt.webp')],
  ['desert', join(terrainDir, 'desert.webp')],
  ['desertAlt', join(terrainDir, 'desert-alt.webp')],
  ['wastes', join(terrainDir, 'wastes.webp')],
  ['wastesAlt', join(terrainDir, 'wastes-alt.webp')],
  ['grasslandWoodlands', join(authoredDir, 'grassland-woodlands.webp'), { authored: true }],
  [
    'woodlandsGrassland',
    join(authoredDir, 'grassland-woodlands.webp'),
    { authored: true, mirror: true },
  ],
  ['grasslandHighland', join(authoredDir, 'grassland-highland.webp'), { authored: true }],
  [
    'highlandGrassland',
    join(authoredDir, 'grassland-highland.webp'),
    { authored: true, mirror: true },
  ],
  ['grasslandDesert', join(authoredDir, 'grassland-desert.webp'), { authored: true }],
  ['desertGrassland', join(authoredDir, 'grassland-desert.webp'), { authored: true, mirror: true }],
  ['highlandSnowfield', join(authoredDir, 'highland-snowfield.webp'), { authored: true }],
  [
    'snowfieldHighland',
    join(authoredDir, 'highland-snowfield.webp'),
    { authored: true, mirror: true },
  ],
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function connectionAlpha(materialIndex, side, x, y) {
  const dx = (x - PIVOT_X) / RADIUS_X;
  const dy = (y - PIVOT_Y) / RADIUS_Y;
  const angle = -(Math.PI / 3) * side;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const inwardDistance = HEX_APOTHEM - (dx * nx + dy * ny);
  if (inwardDistance < -0.02 || inwardDistance > 0.48) return 0;

  const tangent = dx * -ny + dy * nx;
  const broad = Math.sin(tangent * 8.3 + materialIndex * 1.37 + side * 0.61) * 0.046;
  const fine = Math.sin(tangent * 18.7 - materialIndex * 0.83 + side * 1.11) * 0.019;
  const connectionDepth = 0.34 + broad + fine;
  return (1 - smoothstep(0.015, connectionDepth, inwardDistance)) * 0.5;
}

function rotatedSource(source, side) {
  if (side === 0) return source;
  const target = Buffer.alloc(source.length);
  const angle = -(Math.PI / 3) * side;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const dx = x + 0.5 - PIVOT_X;
      const dy = y + 0.5 - PIVOT_Y;
      const sourceX = cosine * dx + sine * dy + PIVOT_X - 0.5;
      const sourceY = -sine * dx + cosine * dy + PIVOT_Y - 0.5;
      const sx = Math.round(sourceX);
      const sy = Math.round(sourceY);
      if (sx < 0 || sx >= FRAME_WIDTH || sy < 0 || sy >= FRAME_HEIGHT) continue;
      const sourceOffset = (sy * FRAME_WIDTH + sx) * 4;
      const targetOffset = (y * FRAME_WIDTH + x) * 4;
      target[targetOffset] = source[sourceOffset];
      target[targetOffset + 1] = source[sourceOffset + 1];
      target[targetOffset + 2] = source[sourceOffset + 2];
      target[targetOffset + 3] = source[sourceOffset + 3];
    }
  }
  return target;
}

const frameCount = sources.length * SIDES;
const atlasRows = Math.ceil(frameCount / ATLAS_COLUMNS);
const atlasWidth = ATLAS_COLUMNS * FRAME_CELL_WIDTH;
const atlasHeight = atlasRows * FRAME_CELL_HEIGHT;
const atlas = Buffer.alloc(atlasWidth * atlasHeight * 4);

for (let materialIndex = 0; materialIndex < sources.length; materialIndex += 1) {
  const [key, filename, options = {}] = sources[materialIndex];
  let pipeline = sharp(filename);
  if (options.mirror) pipeline = pipeline.flop();
  const { data } = await pipeline
    .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let side = 0; side < SIDES; side += 1) {
    const frameSource = options.authored ? rotatedSource(data, side) : data;
    const frameIndex = materialIndex * SIDES + side;
    const frameX = (frameIndex % ATLAS_COLUMNS) * FRAME_CELL_WIDTH + FRAME_GUTTER;
    const frameY = Math.floor(frameIndex / ATLAS_COLUMNS) * FRAME_CELL_HEIGHT + FRAME_GUTTER;
    for (let y = 0; y < FRAME_HEIGHT; y += 1) {
      for (let x = 0; x < FRAME_WIDTH; x += 1) {
        const sourceOffset = (y * FRAME_WIDTH + x) * 4;
        const targetOffset = ((frameY + y) * atlasWidth + frameX + x) * 4;
        atlas[targetOffset] = frameSource[sourceOffset];
        atlas[targetOffset + 1] = frameSource[sourceOffset + 1];
        atlas[targetOffset + 2] = frameSource[sourceOffset + 2];
        atlas[targetOffset + 3] = Math.min(
          255,
          Math.round(
            frameSource[sourceOffset + 3] *
              connectionAlpha(materialIndex, side, x + 0.5, y + 0.5) *
              (options.authored ? 1.55 : 1),
          ),
        );
      }
    }
  }
  process.stdout.write(`territory transition atlas: ${key}\n`);
}

await sharp(atlas, {
  raw: { width: atlasWidth, height: atlasHeight, channels: 4 },
})
  .webp({ quality: 86, alphaQuality: 100, effort: 6, smartSubsample: true })
  .toFile(join(terrainDir, 'transition-atlas.webp'));

process.stdout.write(
  `territory transition atlas: ${frameCount} frames, ${atlasWidth}x${atlasHeight}\n`,
);
