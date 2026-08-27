// Deterministic, versioned topology for the seasonal territory map.
//
// Static cells are deliberately generated from a compact version/radius pair
// instead of being copied into PostgreSQL.  The checksum is persisted with the
// season row and makes a code/data mismatch fail closed during server startup.

export const TERRITORY_MANIFEST_VERSION = 1 as const;
export const TERRITORY_MIN_RADIUS = 63 as const;
export const TERRITORY_MAX_RADIUS = 141 as const;
export const TERRITORY_CELLS_PER_ACTIVE_GUILD = 120 as const;

export type TerritoryTerrain = 'grassland' | 'forest' | 'highland' | 'marsh' | 'wastes';
export type TerritoryResourceKind = 'wood' | 'iron' | 'grain' | 'labor';

export interface TerritoryManifestCell {
  readonly id: number;
  readonly q: number;
  readonly r: number;
  readonly neighbors: readonly number[];
  readonly terrain: TerritoryTerrain;
  readonly resource: TerritoryResourceKind | null;
  /** Cells on which a guild may place its free first keep. */
  readonly starter: boolean;
}

export interface TerritoryManifest {
  readonly version: number;
  readonly radius: number;
  readonly checksum: string;
  readonly cells: readonly TerritoryManifestCell[];
  readonly byId: ReadonlyMap<number, TerritoryManifestCell>;
  readonly byAxial: ReadonlyMap<string, TerritoryManifestCell>;
}

const AXIAL_DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

const TERRAIN: readonly TerritoryTerrain[] = ['grassland', 'forest', 'highland', 'marsh', 'wastes'];
const RESOURCES: readonly TerritoryResourceKind[] = ['wood', 'iron', 'grain', 'labor'];
const manifestCache = new Map<string, TerritoryManifest>();

export function territoryCellCount(radius: number): number {
  const safe = Math.max(0, Math.floor(radius));
  return 1 + 3 * safe * (safe + 1);
}

export function territoryRadiusForActiveGuilds(activeGuilds: number): number {
  const desired = Math.max(1, Math.ceil(activeGuilds)) * TERRITORY_CELLS_PER_ACTIVE_GUILD;
  const root = (-3 + Math.sqrt(12 * desired - 3)) / 6;
  return Math.max(TERRITORY_MIN_RADIUS, Math.min(TERRITORY_MAX_RADIUS, Math.ceil(root)));
}

export function axialKey(q: number, r: number): string {
  return `${q}:${r}`;
}

export function axialDistance(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

/** Flat-topped axial centre in map-space units. */
export function axialToWorld(q: number, r: number, size = 1): { x: number; y: number } {
  return {
    x: size * 1.5 * q,
    y: size * Math.sqrt(3) * (r + q / 2),
  };
}

function mix32(q: number, r: number, salt: number): number {
  let value = Math.imul(q ^ salt, 0x45d9f3b) ^ Math.imul(r + salt, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function fnv1a32(value: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function checksumFor(cells: readonly TerritoryManifestCell[], radius: number): string {
  let hash = fnv1a32(`territory:${TERRITORY_MANIFEST_VERSION}:${radius}`);
  for (const cell of cells) {
    hash = fnv1a32(
      `|${cell.id},${cell.q},${cell.r},${cell.terrain},${cell.resource ?? '-'},${cell.starter ? 1 : 0},${cell.neighbors.join('.')}`,
      hash,
    );
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

export function createTerritoryManifest(radius: number = TERRITORY_MIN_RADIUS): TerritoryManifest {
  const safeRadius = Math.max(
    TERRITORY_MIN_RADIUS,
    Math.min(TERRITORY_MAX_RADIUS, Math.floor(radius)),
  );
  const cacheKey = `${TERRITORY_MANIFEST_VERSION}:${safeRadius}`;
  const cached = manifestCache.get(cacheKey);
  if (cached) return cached;

  const provisional: Array<Omit<TerritoryManifestCell, 'neighbors'>> = [];
  const idByAxial = new Map<string, number>();
  let id = 1;
  for (let r = -safeRadius; r <= safeRadius; r += 1) {
    const qMin = Math.max(-safeRadius, -r - safeRadius);
    const qMax = Math.min(safeRadius, -r + safeRadius);
    for (let q = qMin; q <= qMax; q += 1) {
      const distance = axialDistance(q, r);
      const hash = mix32(q, r, TERRITORY_MANIFEST_VERSION);
      const starterBand = distance >= Math.floor(safeRadius * 0.58) && distance <= safeRadius - 2;
      const starter = starterBand && hash % 29 === 0;
      const terrain = TERRAIN[(hash >>> 5) % TERRAIN.length];
      const hasResource = !starter && distance > 0 && hash % 9 === 0;
      const resource = hasResource ? RESOURCES[(hash >>> 11) % RESOURCES.length] : null;
      provisional.push({ id, q, r, terrain, resource, starter });
      idByAxial.set(axialKey(q, r), id);
      id += 1;
    }
  }

  const cells: TerritoryManifestCell[] = provisional.map((cell) => ({
    ...cell,
    neighbors: AXIAL_DIRECTIONS.map(([dq, dr]) =>
      idByAxial.get(axialKey(cell.q + dq, cell.r + dr)),
    ).filter((neighbor): neighbor is number => neighbor !== undefined),
  }));
  const byId = new Map<number, TerritoryManifestCell>();
  const byAxial = new Map<string, TerritoryManifestCell>();
  for (const cell of cells) {
    byId.set(cell.id, cell);
    byAxial.set(axialKey(cell.q, cell.r), cell);
  }
  const manifest: TerritoryManifest = {
    version: TERRITORY_MANIFEST_VERSION,
    radius: safeRadius,
    checksum: checksumFor(cells, safeRadius),
    cells,
    byId,
    byAxial,
  };
  manifestCache.set(cacheKey, manifest);
  return manifest;
}
