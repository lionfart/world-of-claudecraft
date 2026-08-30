import type { TerritoryVisualBiome } from '../sim/territory_biome';
import type { TerritoryResourceKind, TerritoryTerrain } from '../sim/territory_manifest';

export const TERRITORY_RESOURCE_ART_KEYS = [
  'woodTier1',
  'woodTier2',
  'woodTier3',
  'ironTier1',
  'ironTier2',
  'ironTier3',
  'grainTier1',
  'grainTier2',
  'grainTier3',
  'laborTier1',
  'laborTier2',
  'laborTier3',
  'snowWoodTier1',
  'snowWoodTier2',
  'snowWoodTier3',
  'snowIronTier1',
  'snowIronTier2',
  'snowIronTier3',
  'snowGrainTier1',
  'snowGrainTier2',
  'snowGrainTier3',
  'snowLaborTier1',
  'snowLaborTier2',
  'snowLaborTier3',
  'desertWoodTier1',
  'desertWoodTier2',
  'desertWoodTier3',
  'desertIronTier1',
  'desertIronTier2',
  'desertIronTier3',
  'desertGrainTier1',
  'desertGrainTier2',
  'desertGrainTier3',
  'desertLaborTier1',
  'desertLaborTier2',
  'desertLaborTier3',
] as const;

export type TerritoryResourceArtKey = (typeof TERRITORY_RESOURCE_ART_KEYS)[number];

export const TERRITORY_KEEP_ART_KEYS = ['keepTier1', 'keepTier2', 'keepTier3'] as const;

export type TerritoryKeepArtKey = (typeof TERRITORY_KEEP_ART_KEYS)[number];

export const TERRITORY_MAP_TRANSITION_KEYS = [
  'grasslandWoodlands',
  'grasslandHighland',
  'grasslandMarsh',
  'grasslandSnowfield',
  'grasslandDesert',
  'grasslandWastes',
  'woodlandsHighland',
  'woodlandsMarsh',
  'woodlandsSnowfield',
  'woodlandsDesert',
  'woodlandsWastes',
  'highlandMarsh',
  'highlandSnowfield',
  'highlandDesert',
  'highlandWastes',
  'marshSnowfield',
  'marshDesert',
  'marshWastes',
  'snowfieldDesert',
  'snowfieldWastes',
  'desertWastes',
] as const;

export type TerritoryMapTransitionKey = (typeof TERRITORY_MAP_TRANSITION_KEYS)[number];

export type TerritoryMapArtKey =
  | TerritoryVisualBiome
  | TerritoryTerrain
  | TerritoryResourceArtKey
  | TerritoryKeepArtKey
  | TerritoryMapTransitionKey
  | 'grasslandAlt'
  | 'highlandAlt'
  | 'marshAlt'
  | 'marshBog'
  | 'snowfieldAlt'
  | 'desertAlt'
  | 'desertMesaAlt'
  | 'wastesAlt';
export type TerritoryMapArt = Partial<Record<TerritoryMapArtKey, HTMLImageElement>>;

export interface TerritoryMapArtCell {
  readonly q: number;
  readonly r: number;
  readonly biome: TerritoryVisualBiome;
  readonly resource: TerritoryResourceKind | null;
  readonly resourceYield: number;
  readonly keepRoot: boolean;
  readonly structureLevel?: number;
}

export interface TerritoryMapTransitionCell extends TerritoryMapArtCell {
  readonly neighborBiomes: readonly (TerritoryVisualBiome | null)[];
}

export interface TerritoryMapArtTransform {
  /** Clockwise sixth-turns around the exact authored hex footprint centre. */
  readonly rotationSteps: number;
  /** Safe silhouette variation that never tips upright trees or mountains. */
  readonly mirrorX: boolean;
}

export interface TerritoryMapAuthoredTransition {
  readonly key: TerritoryMapTransitionKey;
  readonly rotationSteps: number;
  readonly mirrorX: boolean;
}

export interface TerritoryMapArtRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const HEX_HEIGHT = Math.sqrt(3);
const SOURCE_HEIGHT = 384;
const SOURCE_FOOTPRINT_TOP = 123;
const SOURCE_FOOTPRINT_HEIGHT = 261;

/**
 * Lock the authored 256x384 pointy-top sprite to one pointy-top map cell.
 * Its non-transparent footprint is exactly 256x261 at y=123: after scaling,
 * that footprint spans sqrt(3)R by 2R while the transparent upper canvas keeps
 * buildings upright and free to rise above their owning tile.
 */
export function territoryTerrainArtRect(
  mx: number,
  my: number,
  radius: number,
): TerritoryMapArtRect {
  const height = (radius * 2 * SOURCE_HEIGHT) / SOURCE_FOOTPRINT_HEIGHT;
  const width = radius * HEX_HEIGHT;
  return {
    x: mx - width / 2,
    y: my - radius - (height * SOURCE_FOOTPRINT_TOP) / SOURCE_HEIGHT,
    width,
    height,
  };
}

/** Every supplied location tile uses the same locked footprint and pivot. */
export function territoryFeatureArtRect(
  mx: number,
  my: number,
  radius: number,
): TerritoryMapArtRect {
  return territoryTerrainArtRect(mx, my, radius);
}

/**
 * A deliberately small atlas of reusable, optimized WebP tiles. Keeping the paths
 * explicit makes it impossible for a manifest cell to trigger an unbounded asset
 * request while the player pans across the map.
 */
export const TERRITORY_MAP_ART_SOURCES: Readonly<Record<TerritoryMapArtKey, string>> = {
  grassland: '/territory_map/grassland.webp',
  grasslandAlt: '/territory_map/grassland-alt.webp',
  woodlands: '/territory_map/woodlands.webp',
  forest: '/territory_map/forest.webp',
  highland: '/territory_map/highland.webp',
  highlandAlt: '/territory_map/highland-alt.webp',
  mountain: '/territory_map/mountain.webp',
  snowfield: '/territory_map/snowfield.webp',
  snowfieldAlt: '/territory_map/snowfield-alt.webp',
  snowForest: '/territory_map/snow-forest.webp',
  snowMountain: '/territory_map/snow-mountain.webp',
  desert: '/territory_map/desert.webp',
  desertAlt: '/territory_map/desert-alt.webp',
  desertMesa: '/territory_map/desert-mesa.webp',
  desertMesaAlt: '/territory_map/desert-mesa-alt.webp',
  marsh: '/territory_map/marsh.webp',
  marshAlt: '/territory_map/marsh-alt.webp',
  marshBog: '/territory_map/marsh-bog.webp',
  wastes: '/territory_map/wastes.webp',
  wastesAlt: '/territory_map/wastes-alt.webp',
  woodTier1: '/territory_map/resource-wood-1.webp',
  woodTier2: '/territory_map/resource-wood-2.webp',
  woodTier3: '/territory_map/resource-wood-3.webp',
  ironTier1: '/territory_map/resource-iron-1.webp',
  ironTier2: '/territory_map/resource-iron-2.webp',
  ironTier3: '/territory_map/resource-iron-3.webp',
  grainTier1: '/territory_map/resource-grain-1.webp',
  grainTier2: '/territory_map/resource-grain-2.webp',
  grainTier3: '/territory_map/resource-grain-3.webp',
  laborTier1: '/territory_map/resource-labor-1.webp',
  laborTier2: '/territory_map/resource-labor-2.webp',
  laborTier3: '/territory_map/resource-labor-3.webp',
  snowWoodTier1: '/territory_map/resource-snow-wood-1.webp',
  snowWoodTier2: '/territory_map/resource-snow-wood-2.webp',
  snowWoodTier3: '/territory_map/resource-snow-wood-3.webp',
  snowIronTier1: '/territory_map/resource-snow-iron-1.webp',
  snowIronTier2: '/territory_map/resource-snow-iron-2.webp',
  snowIronTier3: '/territory_map/resource-snow-iron-3.webp',
  snowGrainTier1: '/territory_map/resource-snow-grain-1.webp',
  snowGrainTier2: '/territory_map/resource-snow-grain-2.webp',
  snowGrainTier3: '/territory_map/resource-snow-grain-3.webp',
  snowLaborTier1: '/territory_map/resource-snow-labor-1.webp',
  snowLaborTier2: '/territory_map/resource-snow-labor-2.webp',
  snowLaborTier3: '/territory_map/resource-snow-labor-3.webp',
  desertWoodTier1: '/territory_map/resource-desert-wood-1.webp',
  desertWoodTier2: '/territory_map/resource-desert-wood-2.webp',
  desertWoodTier3: '/territory_map/resource-desert-wood-3.webp',
  desertIronTier1: '/territory_map/resource-desert-iron-1.webp',
  desertIronTier2: '/territory_map/resource-desert-iron-2.webp',
  desertIronTier3: '/territory_map/resource-desert-iron-3.webp',
  desertGrainTier1: '/territory_map/resource-desert-grain-1.webp',
  desertGrainTier2: '/territory_map/resource-desert-grain-2.webp',
  desertGrainTier3: '/territory_map/resource-desert-grain-3.webp',
  desertLaborTier1: '/territory_map/resource-desert-labor-1.webp',
  desertLaborTier2: '/territory_map/resource-desert-labor-2.webp',
  desertLaborTier3: '/territory_map/resource-desert-labor-3.webp',
  keepTier1: '/territory_map/keep-1.webp',
  keepTier2: '/territory_map/keep-2.webp',
  keepTier3: '/territory_map/keep-3.webp',
  grasslandWoodlands: '/territory_map/transition-grassland-woodlands.webp',
  grasslandHighland: '/territory_map/transition-grassland-highland.webp',
  grasslandMarsh: '/territory_map/transition-grassland-marsh.webp',
  grasslandSnowfield: '/territory_map/transition-grassland-snowfield.webp',
  grasslandDesert: '/territory_map/transition-grassland-desert.webp',
  grasslandWastes: '/territory_map/transition-grassland-wastes.webp',
  woodlandsHighland: '/territory_map/transition-woodlands-highland.webp',
  woodlandsMarsh: '/territory_map/transition-woodlands-marsh.webp',
  woodlandsSnowfield: '/territory_map/transition-woodlands-snowfield.webp',
  woodlandsDesert: '/territory_map/transition-woodlands-desert.webp',
  woodlandsWastes: '/territory_map/transition-woodlands-wastes.webp',
  highlandMarsh: '/territory_map/transition-highland-marsh.webp',
  highlandSnowfield: '/territory_map/transition-highland-snowfield.webp',
  highlandDesert: '/territory_map/transition-highland-desert.webp',
  highlandWastes: '/territory_map/transition-highland-wastes.webp',
  marshSnowfield: '/territory_map/transition-marsh-snowfield.webp',
  marshDesert: '/territory_map/transition-marsh-desert.webp',
  marshWastes: '/territory_map/transition-marsh-wastes.webp',
  snowfieldDesert: '/territory_map/transition-snowfield-desert.webp',
  snowfieldWastes: '/territory_map/transition-snowfield-wastes.webp',
  desertWastes: '/territory_map/transition-desert-wastes.webp',
};

function artHash(q: number, r: number, salt: number): number {
  let value = Math.imul(q ^ salt, 0x45d9f3b) ^ Math.imul(r + salt, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

type TransitionBiomeGroup =
  | 'grassland'
  | 'woodlands'
  | 'highland'
  | 'marsh'
  | 'snowfield'
  | 'desert'
  | 'wastes';

function transitionBiomeGroup(biome: TerritoryVisualBiome): TransitionBiomeGroup {
  if (biome === 'woodlands' || biome === 'forest') return 'woodlands';
  if (biome === 'highland' || biome === 'mountain') return 'highland';
  if (biome === 'snowfield' || biome === 'snowForest' || biome === 'snowMountain')
    return 'snowfield';
  if (biome === 'desert' || biome === 'desertMesa') return 'desert';
  return biome;
}

const AUTHORED_FULL_TILE_TRANSITIONS: Readonly<
  Partial<Record<string, TerritoryMapAuthoredTransition['key']>>
> = {
  'grassland:woodlands': 'grasslandWoodlands',
  'grassland:highland': 'grasslandHighland',
  'grassland:marsh': 'grasslandMarsh',
  'grassland:snowfield': 'grasslandSnowfield',
  'grassland:desert': 'grasslandDesert',
  'grassland:wastes': 'grasslandWastes',
  'woodlands:highland': 'woodlandsHighland',
  'woodlands:marsh': 'woodlandsMarsh',
  'woodlands:snowfield': 'woodlandsSnowfield',
  'woodlands:desert': 'woodlandsDesert',
  'woodlands:wastes': 'woodlandsWastes',
  'highland:marsh': 'highlandMarsh',
  'highland:snowfield': 'highlandSnowfield',
  'highland:desert': 'highlandDesert',
  'highland:wastes': 'highlandWastes',
  'marsh:snowfield': 'marshSnowfield',
  'marsh:desert': 'marshDesert',
  'marsh:wastes': 'marshWastes',
  'snowfield:desert': 'snowfieldDesert',
  'snowfield:wastes': 'snowfieldWastes',
  'desert:wastes': 'desertWastes',
};

/**
 * Selects one of the generated full-hex transition paintings for an ordinary
 * border cell. Each unordered material pair has exactly one canonical owner,
 * so a border stays one transition row wide. Keeps and resource landmarks
 * remain untouched and render with their own art.
 */
export function territoryMapAuthoredTransitionForCell(
  cell: TerritoryMapTransitionCell,
): TerritoryMapAuthoredTransition | null {
  if (cell.keepRoot || cell.resource) return null;
  const base = transitionBiomeGroup(cell.biome);
  for (let side = 0; side < cell.neighborBiomes.length; side += 1) {
    const neighborBiome = cell.neighborBiomes[side];
    if (!neighborBiome) continue;
    const neighbor = transitionBiomeGroup(neighborBiome);
    if (base === neighbor) continue;
    const forward = AUTHORED_FULL_TILE_TRANSITIONS[`${base}:${neighbor}`];
    // Only the first material named by the authored pair owns the transition
    // cell. Letting the reverse side mirror the same painting produced two
    // consecutive rows of transition hexes along every border.
    if (forward)
      return {
        key: forward,
        // Axial sides advance counter-clockwise in screen space while Canvas
        // positive rotation is clockwise. Side 0 already points right, so the
        // remaining directions must rotate by the complementary sixth-turn.
        rotationSteps: (6 - side) % 6,
        mirrorX: false,
      };
  }
  return null;
}

/** True when a biome pair is already represented by one full authored hex row. */
export function territoryMapHasAuthoredFullTransition(
  firstBiome: TerritoryVisualBiome,
  secondBiome: TerritoryVisualBiome,
): boolean {
  const first = transitionBiomeGroup(firstBiome);
  const second = transitionBiomeGroup(secondBiome);
  return (
    AUTHORED_FULL_TILE_TRANSITIONS[`${first}:${second}`] !== undefined ||
    AUTHORED_FULL_TILE_TRANSITIONS[`${second}:${first}`] !== undefined
  );
}

type ResourceBiomeArt = 'temperate' | 'snow' | 'desert';
type ResourceTierArt = readonly [
  TerritoryResourceArtKey,
  TerritoryResourceArtKey,
  TerritoryResourceArtKey,
];

const RESOURCE_ART_BY_BIOME_AND_TIER: Readonly<
  Record<ResourceBiomeArt, Record<TerritoryResourceKind, ResourceTierArt>>
> = {
  temperate: {
    wood: ['woodTier1', 'woodTier2', 'woodTier3'],
    iron: ['ironTier1', 'ironTier2', 'ironTier3'],
    grain: ['grainTier1', 'grainTier2', 'grainTier3'],
    labor: ['laborTier1', 'laborTier2', 'laborTier3'],
  },
  snow: {
    wood: ['snowWoodTier1', 'snowWoodTier2', 'snowWoodTier3'],
    iron: ['snowIronTier1', 'snowIronTier2', 'snowIronTier3'],
    grain: ['snowGrainTier1', 'snowGrainTier2', 'snowGrainTier3'],
    labor: ['snowLaborTier1', 'snowLaborTier2', 'snowLaborTier3'],
  },
  desert: {
    wood: ['desertWoodTier1', 'desertWoodTier2', 'desertWoodTier3'],
    iron: ['desertIronTier1', 'desertIronTier2', 'desertIronTier3'],
    grain: ['desertGrainTier1', 'desertGrainTier2', 'desertGrainTier3'],
    labor: ['desertLaborTier1', 'desertLaborTier2', 'desertLaborTier3'],
  },
};

function resourceBiomeArt(biome: TerritoryVisualBiome): ResourceBiomeArt {
  if (biome === 'snowfield' || biome === 'snowForest' || biome === 'snowMountain') return 'snow';
  if (biome === 'desert' || biome === 'desertMesa') return 'desert';
  return 'temperate';
}

/** Couples every resource identity to a distinct, density-matched tier painting. */
export function territoryMapArtKeyForCell(cell: TerritoryMapArtCell): TerritoryMapArtKey {
  if (cell.keepRoot) {
    const tier = Math.max(1, Math.min(3, Math.floor(cell.structureLevel ?? 1))) as 1 | 2 | 3;
    return TERRITORY_KEEP_ART_KEYS[tier - 1];
  }
  if (cell.resource) {
    const tier = Math.max(1, Math.min(3, Math.floor(cell.resourceYield))) as 1 | 2 | 3;
    return RESOURCE_ART_BY_BIOME_AND_TIER[resourceBiomeArt(cell.biome)][cell.resource][tier - 1];
  }

  const variant = artHash(cell.q, cell.r, 0x72ce_91b5);
  if (cell.biome === 'grassland') return variant % 3 === 0 ? 'grasslandAlt' : 'grassland';
  if (cell.biome === 'highland') return variant % 2 === 0 ? 'highlandAlt' : 'highland';
  if (cell.biome === 'marsh')
    return variant % 3 === 0 ? 'marshBog' : variant % 2 === 0 ? 'marshAlt' : 'marsh';
  if (cell.biome === 'snowfield') return variant % 3 === 0 ? 'snowfieldAlt' : 'snowfield';
  if (cell.biome === 'desert') return variant % 3 === 0 ? 'desertAlt' : 'desert';
  if (cell.biome === 'desertMesa') return variant % 2 === 0 ? 'desertMesaAlt' : 'desertMesa';
  if (cell.biome === 'wastes') return variant % 2 === 0 ? 'wastesAlt' : 'wastes';
  return cell.biome;
}

const ROTATABLE_ART = new Set<TerritoryMapArtKey>([
  'grassland',
  'grasslandAlt',
  'woodlands',
  'highland',
  'highlandAlt',
  'marsh',
  'marshAlt',
  'marshBog',
  'snowfield',
  'snowfieldAlt',
  'desert',
  'desertAlt',
  'wastes',
  'wastesAlt',
  ...TERRITORY_MAP_TRANSITION_KEYS,
]);

/** Ground-only paintings can safely overfill and clip to erase sprite bevels. */
export function territoryMapArtIsGround(key: TerritoryMapArtKey): boolean {
  return ROTATABLE_ART.has(key);
}

/**
 * Flat terrain may rotate by exact 60-degree increments. Upright silhouettes
 * only mirror horizontally, so trees, mountains and buildings never lie down.
 */
export function territoryMapArtTransformForCell(
  cell: Pick<TerritoryMapArtCell, 'q' | 'r'>,
  key: TerritoryMapArtKey,
): TerritoryMapArtTransform {
  const variation = artHash(cell.q, cell.r, 0x198a_2d41);
  if (ROTATABLE_ART.has(key)) return { rotationSteps: variation % 6, mirrorX: false };
  return {
    rotationSteps: 0,
    mirrorX: !key.startsWith('keepTier') && (variation >>> 5) % 2 === 1,
  };
}

type ArtLoadState = 'idle' | 'loading' | 'ready';

let loadState: ArtLoadState = 'idle';
const images: TerritoryMapArt = {};
const readyListeners = new Set<() => void>();

/**
 * Starts one batched decode on the first territory-map paint and returns the
 * shared image cache. The callback fires once after every tile has either loaded
 * or failed, which avoids ten cold-load repaints.
 */
export function territoryMapArt(onReady: () => void): TerritoryMapArt {
  if (loadState === 'ready') return images;
  readyListeners.add(onReady);
  if (loadState === 'loading') return images;

  loadState = 'loading';
  let remaining = Object.keys(TERRITORY_MAP_ART_SOURCES).length;
  const settled = (): void => {
    remaining -= 1;
    if (remaining > 0) return;
    loadState = 'ready';
    const listeners = [...readyListeners];
    readyListeners.clear();
    for (const listener of listeners) listener();
  };

  for (const [key, src] of Object.entries(TERRITORY_MAP_ART_SOURCES) as Array<
    [TerritoryMapArtKey, string]
  >) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      images[key] = image;
      settled();
    };
    image.onerror = settled;
    image.src = src;
  }
  return images;
}
