import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const terrainDir = join(repoRoot, 'public', 'territory_map');
const resourceDir = join(repoRoot, 'assets', 'territory_map', 'resources');
const transitionDir = join(repoRoot, 'assets', 'territory_map', 'transitions');
const keepDir = join(repoRoot, 'assets', 'territory_map', 'keeps');

const WIDTH = 256;
const HEIGHT = 384;
const PAINTED_HEIGHT = 261;
const TOP_GUTTER = HEIGHT - PAINTED_HEIGHT;
const HEX_MASK = Buffer.from(`
  <svg width="${WIDTH}" height="${PAINTED_HEIGHT}" viewBox="0 0 ${WIDTH} ${PAINTED_HEIGHT}">
    <polygon points="128,0 256,65 256,195 128,261 0,195 0,65" fill="white"/>
  </svg>
`);
const VALID_BIOMES = new Set([
  'grassland',
  'woodlands',
  'highland',
  'marsh',
  'snowfield',
  'desert',
  'wastes',
]);

async function normalizeTransition(source, destination) {
  const metadata = await sharp(source).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
    throw new Error(`Territory transition must be ${WIDTH}x${HEIGHT}: ${source}`);
  }

  const paintedTile = await sharp(source)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
    .resize(WIDTH, PAINTED_HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: HEX_MASK, blend: 'dest-in' }])
    .png({ compressionLevel: 4 })
    .toBuffer();

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: paintedTile, top: TOP_GUTTER, left: 0 }])
    .webp({ quality: 86, alphaQuality: 100, effort: 4, smartSubsample: true })
    .toFile(destination);
}

await mkdir(terrainDir, { recursive: true });

const resourceFiles = (await readdir(resourceDir)).filter((name) => name.endsWith('.webp')).sort();
for (const name of resourceFiles) {
  await copyFile(join(resourceDir, name), join(terrainDir, `resource-${name}`));
  process.stdout.write(`territory resource tile: ${name}\n`);
}

const keepFiles = (await readdir(keepDir)).filter((name) => name.endsWith('.webp')).sort();
for (const name of keepFiles) {
  await copyFile(join(keepDir, name), join(terrainDir, name));
  process.stdout.write(`territory keep tile: ${name}\n`);
}

const transitionFiles = (await readdir(transitionDir))
  .filter((name) => name.endsWith('.webp'))
  .sort();
for (const name of transitionFiles) {
  const pair = name.slice(0, -'.webp'.length).split('-');
  if (pair.length !== 2 || !VALID_BIOMES.has(pair[0]) || !VALID_BIOMES.has(pair[1])) {
    throw new Error(`Invalid territory transition filename: ${name}`);
  }
  await normalizeTransition(join(transitionDir, name), join(terrainDir, `transition-${name}`));
  process.stdout.write(`territory transition tile: ${name}\n`);
}

for (const legacy of [
  'wood.webp',
  'iron.webp',
  'grain.webp',
  'grain-low.webp',
  'labor.webp',
  'keep.webp',
  'transition-atlas-authored.webp',
]) {
  await rm(join(terrainDir, legacy), { force: true });
}

process.stdout.write(
  `territory map art: ${resourceFiles.length} resource tiers, ${keepFiles.length} keep tiers, ${transitionFiles.length} full transitions\n`,
);
