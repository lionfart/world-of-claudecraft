import type {
  TerritoryManifestCell,
  TerritoryResourceKind,
  TerritoryTerrain,
} from './territory_manifest';

/**
 * Deterministic geography shared by the strategic-map art and territory
 * production. Persisted topology and the manifest checksum remain unchanged,
 * so an active season does not need to be reset when the presentation evolves.
 */
export type TerritoryVisualBiome =
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

export interface TerritoryResourceProfile {
  readonly kind: TerritoryResourceKind;
  /** Units produced by this cell per territory resource tick. */
  readonly yield: 1 | 2 | 3;
}

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
  if (elevation > 0.93) return 'mountain';
  if (elevation > 0.84) return 'highland';
  if (moisture > 0.8 && elevation < 0.39) return 'marsh';
  if (moisture > 0.82) return 'forest';
  if (moisture > 0.6) return 'woodlands';
  if (moisture < 0.18 && elevation < 0.36) return 'wastes';
  return 'grassland';
}

/**
 * Builds one coherent landmass: a cold north, an eastern desert, a broken
 * mountain spine, and temperate forest/plains between them. Every manifest
 * cell remains land; there is no decorative sea ring consuming playable hexes.
 */
export function territoryVisualBiome(
  cell: Pick<TerritoryManifestCell, 'q' | 'r' | 'terrain'>,
  radius: number,
): TerritoryVisualBiome {
  const safeRadius = Math.max(1, radius);
  const nx = (cell.q + cell.r / 2) / safeRadius;
  const ny = cell.r / safeRadius;
  const moisture = regionNoise(cell.q, cell.r, 7, 0x2f6e2b1);
  const elevation = regionNoise(cell.q, cell.r, 8, 0x6c8e9cf);

  // Cold cap. Elevation and moisture select broad sub-regions, not individual
  // random tiles, because both fields are sampled on a seven/eight-cell lattice.
  if (ny < -0.67) {
    if (elevation > 0.84 || (Math.abs(nx + 0.06) < 0.04 && elevation > 0.7)) return 'snowMountain';
    return moisture > 0.7 ? 'snowForest' : 'snowfield';
  }

  // Warm continental east/south-east. Tall mesas stay within the desert mass
  // so their silhouettes do not pepper otherwise green land.
  if (nx > 0.61 && ny > -0.02) {
    return nx > 0.78 && elevation > 0.78 ? 'desertMesa' : 'desert';
  }

  // A diagonal mountain spine separates the western temperate lands from the
  // dry east. Noise breaks it into natural passes while preserving continuity.
  const ridge = Math.abs(nx + ny * 0.28 + 0.05);
  if (ridge < 0.045 && elevation > 0.62) return elevation > 0.83 ? 'mountain' : 'highland';

  return inlandTerrain(cell.terrain, moisture, elevation);
}

/**
 * Resource identity and strength follow what the tile actually depicts.
 * Dense forests always produce more wood than sparse woodland; farms use two
 * grain tiers, while ore-bearing mountain cells vary between natural ridges
 * and rich mine sites. The old manifest marker is retained only as the sparse
 * seed for settlement/labour cells.
 */
export function territoryResourceProfile(
  cell: Pick<TerritoryManifestCell, 'q' | 'r' | 'terrain' | 'resource'>,
  radius: number,
): TerritoryResourceProfile | null {
  const biome = territoryVisualBiome(cell, radius);
  const variation = mix32(cell.q, cell.r, 0x4a61_2f9d);

  if (biome === 'forest') {
    // Forester clearings contain fewer standing trees than untouched forest.
    return { kind: 'wood', yield: variation % 5 === 0 ? 2 : 3 };
  }
  if (biome === 'snowForest') return { kind: 'wood', yield: 2 };
  if (biome === 'woodlands') return { kind: 'wood', yield: 1 };

  if (biome === 'grassland') {
    if (cell.resource === 'labor' && variation % 2 === 0) return { kind: 'labor', yield: 1 };
    const farmRoll = variation % 10;
    if (farmRoll < 2) return { kind: 'grain', yield: 2 };
    if (farmRoll < 4) return { kind: 'grain', yield: 1 };
    return null;
  }

  if (biome === 'highland' && variation % 3 === 0)
    return { kind: 'iron', yield: variation % 9 === 0 ? 3 : 1 };
  if ((biome === 'mountain' || biome === 'snowMountain') && variation % 2 === 0)
    return { kind: 'iron', yield: variation % 6 === 0 ? 3 : 2 };
  if (biome === 'desertMesa' && variation % 4 === 0) return { kind: 'iron', yield: 1 };

  if (
    cell.resource === 'labor' &&
    (biome === 'desert' || biome === 'wastes') &&
    variation % 2 === 0
  )
    return { kind: 'labor', yield: 1 };
  return null;
}
