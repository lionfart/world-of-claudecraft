import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERRITORY_MAP_ART_SOURCES,
  territoryFeatureArtRect,
  territoryMapArtKeyForCell,
  territoryMapArtTransformForCell,
  territoryTerrainArtRect,
  territoryTransitionArtKey,
} from '../src/ui/territory_map_art';
import {
  TERRITORY_COMPOSITE_HEIGHT,
  TERRITORY_COMPOSITE_PIVOT_X,
  TERRITORY_COMPOSITE_PIVOT_Y,
  TERRITORY_COMPOSITE_WIDTH,
  territoryConnectionAlpha,
} from '../src/ui/territory_map_tile_composer';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const painterSource = readFileSync(join(repoRoot, 'src', 'ui', 'territory_map_painter.ts'), 'utf8');

describe('territory map art bundle', () => {
  it('ships one bounded lossless WebP tile for every terrain, resource, and keep key', () => {
    const sources = Object.values(TERRITORY_MAP_ART_SOURCES);
    expect(sources).toHaveLength(26);
    expect(new Set(sources).size).toBe(sources.length);

    let totalBytes = 0;
    for (const source of sources) {
      expect(source).toMatch(/^\/territory_map\/[a-z-]+\.webp$/);
      const file = join(repoRoot, 'public', source.slice(1));
      const bytes = readFileSync(file);
      totalBytes += statSync(file).size;
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(bytes.length).toBeLessThan(120_000);
    }
    expect(totalBytes).toBeLessThan(2_300_000);
  });

  it('locks the authored opaque footprint to the exact pointy-top cell', () => {
    const radius = 20;
    const rect = territoryTerrainArtRect(100, 80, radius);
    expect(rect.width).toBeCloseTo(Math.sqrt(3) * radius, 8);
    expect(rect.x + rect.width / 2).toBeCloseTo(100, 8);
    expect(rect.y + (rect.height * 123) / 384).toBeCloseTo(80 - radius, 8);
    expect(rect.y + rect.height).toBeCloseTo(80 + radius, 8);
  });

  it('uses one identical footprint and pivot for terrain, resource, and keep art', () => {
    const radius = 20;
    expect(territoryFeatureArtRect(100, 80, radius)).toEqual(
      territoryTerrainArtRect(100, 80, radius),
    );
  });

  it('draws one complete material-correct source tile per cell without crop distortion', () => {
    expect(painterSource).toContain('territoryTerrainArtRect(');
    expect(painterSource).toContain('territoryMapArtTransformForCell(cell, key)');
    expect(painterSource).toContain('ctx.rotate((transform.rotationSteps * Math.PI) / 3)');
    expect(painterSource).not.toContain('territoryTerrainArtSourceRect(');
  });

  it('uses distinct low/high farm art and density-matched forest art', () => {
    const base = { q: 2, r: -3, biome: 'grassland' as const, keepRoot: false };
    expect(territoryMapArtKeyForCell({ ...base, resource: 'grain', resourceYield: 1 })).toBe(
      'grainLow',
    );
    expect(territoryMapArtKeyForCell({ ...base, resource: 'grain', resourceYield: 2 })).toBe(
      'grain',
    );
    expect(
      territoryMapArtKeyForCell({
        ...base,
        biome: 'forest',
        resource: 'wood',
        resourceYield: 2,
      }),
    ).toBe('wood');
    expect(
      territoryMapArtKeyForCell({
        ...base,
        biome: 'forest',
        resource: 'wood',
        resourceYield: 3,
      }),
    ).toBe('forest');
  });

  it('rotates only flat ground and keeps upright silhouettes vertical', () => {
    const flat = territoryMapArtTransformForCell({ q: 7, r: -4 }, 'grassland');
    const mountain = territoryMapArtTransformForCell({ q: 7, r: -4 }, 'mountain');
    expect(flat.rotationSteps).toBeGreaterThanOrEqual(0);
    expect(flat.rotationSteps).toBeLessThan(6);
    expect(flat.mirrorX).toBe(false);
    expect(mountain.rotationSteps).toBe(0);
    expect(typeof mountain.mirrorX).toBe('boolean');
  });

  it('uses low-silhouette material art for every biome transition', () => {
    expect(territoryTransitionArtKey('mountain', 1, 2, 0)).toMatch(/^highland/);
    expect(territoryTransitionArtKey('snowMountain', 1, 2, 1)).toMatch(/^snowfield/);
    expect(territoryTransitionArtKey('forest', 1, 2, 2)).toBe('woodlands');
    expect(territoryTransitionArtKey('desertMesa', 1, 2, 3)).toMatch(/^desert/);
    expect(painterSource).toContain('this.tileComposer.compose(cell, art)');
    expect(painterSource).not.toContain('transitionBand');
    expect(painterSource).not.toContain('biomeTransitions');
  });

  it('builds deterministic organic connection masks that preserve tile centres', () => {
    const centre = territoryConnectionAlpha(
      3,
      -2,
      0,
      TERRITORY_COMPOSITE_PIVOT_X,
      TERRITORY_COMPOSITE_PIVOT_Y,
    );
    const eastEdge = territoryConnectionAlpha(
      3,
      -2,
      0,
      TERRITORY_COMPOSITE_WIDTH - 0.5,
      TERRITORY_COMPOSITE_PIVOT_Y,
    );
    const oppositeEdge = territoryConnectionAlpha(3, -2, 0, 0.5, TERRITORY_COMPOSITE_PIVOT_Y);
    expect(TERRITORY_COMPOSITE_HEIGHT).toBe(384);
    expect(centre).toBe(0);
    expect(eastEdge).toBeGreaterThan(0.45);
    expect(oppositeEdge).toBe(0);
    expect(territoryConnectionAlpha(3, -2, 0, 225.5, 253.5)).toBe(eastEdge);
  });
});
