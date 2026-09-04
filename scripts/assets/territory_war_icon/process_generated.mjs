// Convert the generated War Map launcher source (painted on a near-black field)
// into the same 128px, real-alpha WebP contract as the other HUD launchers.
//
// Usage:
//   node scripts/assets/territory_war_icon/process_generated.mjs <source.png> <output.webp>

// Only near-black pixels connected to the canvas edge are keyed. That preserves
// the keep doorway and the heavy ink outline inside the painted silhouette.

import path from 'node:path';
import sharp from 'sharp';

const [source, output] = process.argv.slice(2);
if (!source || !output) {
  throw new Error('expected <source.png> and <output.webp>');
}

const raw = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data, info } = raw;
const { width, height } = info;
const pixels = width * height;
const exterior = new Uint8Array(pixels);
const queue = new Int32Array(pixels);
let head = 0;
let tail = 0;

function isNearBlack(index) {
  const offset = index * 4;
  return Math.max(data[offset], data[offset + 1], data[offset + 2]) <= 8;
}

function enqueue(index) {
  if (index < 0 || index >= pixels || exterior[index] || !isNearBlack(index)) return;
  exterior[index] = 1;
  queue[tail++] = index;
}

for (let x = 0; x < width; x++) {
  enqueue(x);
  enqueue((height - 1) * width + x);
}
for (let y = 1; y < height - 1; y++) {
  enqueue(y * width);
  enqueue(y * width + width - 1);
}

while (head < tail) {
  const index = queue[head++];
  const x = index % width;
  if (x > 0) enqueue(index - 1);
  if (x + 1 < width) enqueue(index + 1);
  if (index >= width) enqueue(index - width);
  if (index + width < pixels) enqueue(index + width);
}

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let index = 0; index < pixels; index++) {
  const offset = index * 4;
  if (exterior[index]) data[offset + 3] = 0;
  if (data[offset + 3] <= 8) continue;
  const x = index % width;
  const y = Math.floor(index / width);
  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
  maxX = Math.max(maxX, x);
  maxY = Math.max(maxY, y);
}
if (maxX < 0) throw new Error('the generated source was fully keyed out');

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
await sharp(data, { raw: { width, height, channels: 4 } })
  .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
  .resize(118, 118, { fit: 'contain', background: transparent })
  .extend({ top: 5, bottom: 5, left: 5, right: 5, background: transparent })
  .webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 6 })
  .toFile(path.resolve(output));

console.log(`[territory-war-icon] ${path.basename(source)} -> ${path.basename(output)}`);
