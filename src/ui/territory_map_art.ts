import type { TerritoryVisualBiome } from '../sim/territory_biome';
import type { TerritoryResourceKind, TerritoryTerrain } from '../sim/territory_manifest';

export type TerritoryMapArtKey =
  | TerritoryVisualBiome
  | TerritoryTerrain
  | TerritoryResourceKind
  | 'grasslandAlt'
  | 'highlandAlt'
  | 'marshAlt'
  | 'marshBog'
  | 'snowfieldAlt'
  | 'desertAlt'
  | 'desertMesaAlt'
  | 'wastesAlt'
  | 'grainLow'
  | 'keep';
export type TerritoryMapArt = Partial<Record<TerritoryMapArtKey, HTMLImageElement>>;

export interface TerritoryMapArtCell {
  readonly q: number;
  readonly r: number;
  readonly biome: TerritoryVisualBiome;
  readonly resource: TerritoryResourceKind | null;
  readonly resourceYield: number;
  readonly keepRoot: boolean;
}

export interface TerritoryMapArtTransform {
  /** Clockwise sixth-turns around the exact authored hex footprint centre. */
  readonly rotationSteps: number;
  /** Safe silhouette variation that never tips upright trees or mountains. */
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
 * A deliberately small atlas of reusable, lossless WebP tiles. Keeping the paths
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
  wood: '/territory_map/wood.webp',
  iron: '/territory_map/iron.webp',
  grain: '/territory_map/grain.webp',
  grainLow: '/territory_map/grain-low.webp',
  labor: '/territory_map/labor.webp',
  keep: '/territory_map/keep.webp',
};

function artHash(q: number, r: number, salt: number): number {
  let value = Math.imul(q ^ salt, 0x45d9f3b) ^ Math.imul(r + salt, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Couples visual density to the resource tier while varying ordinary terrain. */
export function territoryMapArtKeyForCell(cell: TerritoryMapArtCell): TerritoryMapArtKey {
  if (cell.keepRoot) return 'keep';
  if (cell.resource === 'grain') return cell.resourceYield >= 2 ? 'grain' : 'grainLow';
  if (cell.resource === 'labor') return 'labor';
  if (cell.resource === 'wood' && cell.biome === 'forest' && cell.resourceYield === 2)
    return 'wood';
  if (cell.resource === 'iron' && cell.biome === 'highland' && cell.resourceYield >= 3)
    return 'iron';

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
  'highland',
  'marsh',
  'marshAlt',
  'marshBog',
  'snowfield',
  'snowfieldAlt',
  'desert',
  'desertAlt',
  'wastes',
  'wastesAlt',
  'grainLow',
]);

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
  return { rotationSteps: 0, mirrorX: key !== 'keep' && (variation >>> 5) % 2 === 1 };
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
