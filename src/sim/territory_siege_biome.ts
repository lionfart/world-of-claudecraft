import { type TerritoryVisualBiome, territoryVisualBiome } from './territory_biome';
import type { TerritoryManifestCell } from './territory_manifest';

/** The four battlefield art directions supported by the shared siege layout. */
export type TerritorySiegeBiome = 'temperate' | 'rocky' | 'snow' | 'desert';

/**
 * Collapse the strategic map's finer visual geography into battlefield sets.
 * Gameplay geometry stays identical; only the authored environment changes.
 */
export function territorySiegeBiomeForVisualBiome(
  biome: TerritoryVisualBiome,
): TerritorySiegeBiome {
  switch (biome) {
    case 'highland':
    case 'mountain':
      return 'rocky';
    case 'snowfield':
    case 'snowForest':
    case 'snowMountain':
      return 'snow';
    case 'desert':
    case 'desertMesa':
    case 'wastes':
      return 'desert';
    default:
      return 'temperate';
  }
}

export function territorySiegeBiomeForCell(
  cell: Pick<TerritoryManifestCell, 'q' | 'r' | 'terrain'> | null | undefined,
  radius: number,
): TerritorySiegeBiome {
  return cell ? territorySiegeBiomeForVisualBiome(territoryVisualBiome(cell, radius)) : 'temperate';
}
