import type { TerritoryResourceKind, TerritoryTerrain } from '../sim/territory_manifest';

export type TerritoryMapArtKey = TerritoryTerrain | TerritoryResourceKind | 'keep';
export type TerritoryMapArt = Partial<Record<TerritoryMapArtKey, HTMLImageElement>>;

export interface TerritoryMapArtRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SOURCE_ASPECT = 384 / 256;
const HEX_HEIGHT = Math.sqrt(3);
const SOURCE_BASE_VISIBLE_FRACTION = 2 / 3;
const FEATURE_HEIGHT_FRACTION = 0.94;

/** Adapt the supplied point-up base to the exact vertical span of a flat-top hex. */
export function territoryTerrainArtRect(
  mx: number,
  my: number,
  radius: number,
): TerritoryMapArtRect {
  const visibleHeight = radius * HEX_HEIGHT;
  const height = visibleHeight / SOURCE_BASE_VISIBLE_FRACTION;
  return {
    x: mx - radius,
    y: my + visibleHeight / 2 - height,
    width: radius * 2,
    height,
  };
}

/** Keep/resource illustrations retain their full 256x384 silhouette inside a hex. */
export function territoryFeatureArtRect(
  mx: number,
  my: number,
  radius: number,
): TerritoryMapArtRect {
  const height = radius * HEX_HEIGHT * FEATURE_HEIGHT_FRACTION;
  const width = height / SOURCE_ASPECT;
  return {
    x: mx - width / 2,
    y: my + (radius * HEX_HEIGHT) / 2 - height,
    width,
    height,
  };
}

/**
 * A deliberately small atlas of reusable, lossless WebP tiles. Keeping the paths
 * explicit makes it impossible for a manifest cell to trigger an unbounded asset
 * request while the player pans across the map.
 */
export const TERRITORY_MAP_ART_SOURCES: Readonly<Record<TerritoryMapArtKey, string>> = {
  grassland: '/territory_map/grassland.webp',
  forest: '/territory_map/forest.webp',
  highland: '/territory_map/highland.webp',
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
