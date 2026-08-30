import type { TerritoryVisualBiome } from '../sim/territory_biome';
import type { TerritoryResourceKind, TerritoryTerrain } from '../sim/territory_manifest';

export type TerritoryMapArtKey =
  | TerritoryVisualBiome
  | TerritoryTerrain
  | TerritoryResourceKind
  | 'keep';
export type TerritoryMapArt = Partial<Record<TerritoryMapArtKey, HTMLImageElement>>;

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
  ocean: '/territory_map/ocean.webp',
  coast: '/territory_map/coast.webp',
  woodlands: '/territory_map/woodlands.webp',
  forest: '/territory_map/forest.webp',
  highland: '/territory_map/highland.webp',
  mountain: '/territory_map/mountain.webp',
  snowfield: '/territory_map/snowfield.webp',
  snowForest: '/territory_map/snow-forest.webp',
  snowMountain: '/territory_map/snow-mountain.webp',
  desert: '/territory_map/desert.webp',
  desertMesa: '/territory_map/desert-mesa.webp',
  marsh: '/territory_map/marsh.webp',
  wastes: '/territory_map/wastes.webp',
  wood: '/territory_map/wood.webp',
  iron: '/territory_map/iron.webp',
  grain: '/territory_map/grain.webp',
  labor: '/territory_map/labor.webp',
  keep: '/territory_map/keep.webp',
};

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
