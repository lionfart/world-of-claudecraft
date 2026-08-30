import {
  axialDistance,
  type TerritoryManifestCell,
  type TerritoryTerrain,
} from './territory_manifest';

/**
 * Visual-only geography for the strategic map. Gameplay terrain, resources,
 * ownership and the persisted manifest checksum remain unchanged; this layer
 * groups the authored tile art into broad, readable regions instead of a
 * per-cell random checkerboard.
 */
export type TerritoryVisualBiome =
  | 'ocean'
  | 'coast'
  | 'grassland'
  | 'woodlands'
  | 'forest'
  | 'marsh'
  | 'highland'
  | 'mountain'
  | 'snowfield'
  | 'snowForest'
  | 'snowMountain'
  | 'desert'
  | 'desertMesa'
  | 'wastes';

function mix32(x: number, y: number, salt: number): number {
  let value = Math.imul(x ^ salt, 0x45d9f3b) ^ Math.imul(y + salt, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** Low-frequency deterministic value noise; the large lattice keeps biomes contiguous. */
function regionNoise(q: number, r: number, scale: number, salt: number): number {
  const x = q / scale;
  const y = r / scale;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const sample = (sx: number, sy: number): number => mix32(sx, sy, salt) / 0xffffffff;
  const top = sample(x0, y0) * (1 - tx) + sample(x0 + 1, y0) * tx;
  const bottom = sample(x0, y0 + 1) * (1 - tx) + sample(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

function inlandTerrain(
  _terrain: TerritoryTerrain,
  moisture: number,
  elevation: number,
): TerritoryVisualBiome {
  // Do not let the authoritative per-cell gameplay terrain choose the art
  // directly here: that source is intentionally granular and would recreate
  // the checkerboard this visual geography is replacing. Both fields below
  // are low-frequency, so every branch produces a contiguous region.
  if (elevation > 0.82) return 'mountain';
  if (elevation > 0.72) return 'highland';
  if (moisture > 0.72 && elevation < 0.43) return 'marsh';
  if (moisture > 0.65) return 'forest';
  if (moisture > 0.53) return 'woodlands';
  if (moisture < 0.25 && elevation < 0.42) return 'wastes';
  return 'grassland';
}

/**
 * Builds one coherent continent: ocean rim, a cold north, an eastern desert,
 * a broken mountain spine, and temperate forest/plains between them.
 */
export function territoryVisualBiome(
  cell: Pick<TerritoryManifestCell, 'q' | 'r' | 'terrain'>,
  radius: number,
): TerritoryVisualBiome {
  const safeRadius = Math.max(1, radius);
  const distance = axialDistance(cell.q, cell.r);
  if (distance >= safeRadius - 1) return 'ocean';

  const nx = (cell.q + cell.r / 2) / safeRadius;
  const ny = cell.r / safeRadius;
  const moisture = regionNoise(cell.q, cell.r, 7, 0x2f6e2b1);
  const elevation = regionNoise(cell.q, cell.r, 8, 0x6c8e9cf);

  // A sparse sandy transition makes the ocean rim read as a coast without
  // drawing a mechanically uniform second ring around the whole continent.
  if (distance >= safeRadius - 3 && ny > -0.2 && (nx < 0.32 || ny > 0.42)) return 'coast';

  // Cold cap. Elevation and moisture select broad sub-regions, not individual
  // random tiles, because both fields are sampled on a seven/eight-cell lattice.
  if (ny < -0.36) {
    if (elevation > 0.57 || Math.abs(nx + 0.06) < 0.1) return 'snowMountain';
    return moisture > 0.5 ? 'snowForest' : 'snowfield';
  }

  // Warm continental east/south-east. Tall mesas stay within the desert mass
  // so their silhouettes do not pepper otherwise green land.
  if (nx > 0.3 && ny > -0.12) {
    return elevation > 0.58 ? 'desertMesa' : 'desert';
  }

  // A diagonal mountain spine separates the western temperate lands from the
  // dry east. Noise breaks it into natural passes while preserving continuity.
  const ridge = Math.abs(nx + ny * 0.28 + 0.05);
  if (ridge < 0.1 && elevation > 0.38) return elevation > 0.55 ? 'mountain' : 'highland';

  return inlandTerrain(cell.terrain, moisture, elevation);
}
