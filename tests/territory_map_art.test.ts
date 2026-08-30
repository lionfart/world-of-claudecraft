import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERRITORY_KEEP_ART_KEYS,
  TERRITORY_MAP_ART_SOURCES,
  TERRITORY_MAP_TRANSITION_KEYS,
  TERRITORY_RESOURCE_ART_KEYS,
  territoryFeatureArtRect,
  territoryMapArtIsGround,
  territoryMapArtKeyForCell,
  territoryMapArtTransformForCell,
  territoryMapAuthoredTransitionForCell,
  territoryMapHasAuthoredFullTransition,
  territoryTerrainArtRect,
} from '../src/ui/territory_map_art';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const painterSource = readFileSync(join(repoRoot, 'src', 'ui', 'territory_map_painter.ts'), 'utf8');

const TRANSITION_PAIRS = [
  ['grassland', 'woodlands', 'grasslandWoodlands'],
  ['grassland', 'highland', 'grasslandHighland'],
  ['grassland', 'marsh', 'grasslandMarsh'],
  ['grassland', 'snowfield', 'grasslandSnowfield'],
  ['grassland', 'desert', 'grasslandDesert'],
  ['grassland', 'wastes', 'grasslandWastes'],
  ['woodlands', 'highland', 'woodlandsHighland'],
  ['woodlands', 'marsh', 'woodlandsMarsh'],
  ['woodlands', 'snowfield', 'woodlandsSnowfield'],
  ['woodlands', 'desert', 'woodlandsDesert'],
  ['woodlands', 'wastes', 'woodlandsWastes'],
  ['highland', 'marsh', 'highlandMarsh'],
  ['highland', 'snowfield', 'highlandSnowfield'],
  ['highland', 'desert', 'highlandDesert'],
  ['highland', 'wastes', 'highlandWastes'],
  ['marsh', 'snowfield', 'marshSnowfield'],
  ['marsh', 'desert', 'marshDesert'],
  ['marsh', 'wastes', 'marshWastes'],
  ['snowfield', 'desert', 'snowfieldDesert'],
  ['snowfield', 'wastes', 'snowfieldWastes'],
  ['desert', 'wastes', 'desertWastes'],
] as const;

describe('territory map art bundle', () => {
  it('ships a bounded optimized WebP bundle for terrain, every resource tier, and transitions', () => {
    const sources = Object.values(TERRITORY_MAP_ART_SOURCES);
    expect(sources).toHaveLength(80);
    expect(new Set(sources).size).toBe(sources.length);

    let totalBytes = 0;
    for (const source of sources) {
      expect(source).toMatch(/^\/territory_map\/[a-z0-9-]+\.webp$/);
      const file = join(repoRoot, 'public', source.slice(1));
      const bytes = readFileSync(file);
      totalBytes += statSync(file).size;
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(bytes.length).toBeLessThan(120_000);
    }
    expect(totalBytes).toBeLessThan(4_000_000);
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

  it('maps every resource and yield level to biome-specific authored tiles', () => {
    const resources = ['wood', 'iron', 'grain', 'labor'] as const;
    const variants = [
      { biome: 'grassland' as const, keyPrefix: '', filePrefix: '' },
      { biome: 'snowfield' as const, keyPrefix: 'snow', filePrefix: 'snow-' },
      { biome: 'desert' as const, keyPrefix: 'desert', filePrefix: 'desert-' },
    ] as const;
    for (const variant of variants) {
      for (const resource of resources) {
        for (const tier of [1, 2, 3] as const) {
          const titleCaseResource = `${resource[0].toUpperCase()}${resource.slice(1)}`;
          const expected = `${variant.keyPrefix}${variant.keyPrefix ? titleCaseResource : resource}Tier${tier}`;
          expect(
            territoryMapArtKeyForCell({
              q: 2,
              r: -3,
              biome: variant.biome,
              keepRoot: false,
              resource,
              resourceYield: tier,
            }),
          ).toBe(expected);
          expect(
            TERRITORY_MAP_ART_SOURCES[expected as keyof typeof TERRITORY_MAP_ART_SOURCES],
          ).toBe(`/territory_map/resource-${variant.filePrefix}${resource}-${tier}.webp`);
        }
      }
    }
    expect(TERRITORY_RESOURCE_ART_KEYS).toHaveLength(36);
    expect(new Set(TERRITORY_RESOURCE_ART_KEYS)).toHaveLength(36);
    expect(
      territoryMapArtKeyForCell({
        q: 2,
        r: -3,
        biome: 'highland',
        keepRoot: false,
        resource: 'iron',
        resourceYield: 1,
      }),
    ).toBe('ironTier1');
  });

  it('shows the claimed city at its highest structure development tier', () => {
    const base = {
      q: 4,
      r: 8,
      biome: 'grassland' as const,
      keepRoot: true,
      resource: null,
      resourceYield: 0,
    };
    expect(TERRITORY_KEEP_ART_KEYS).toEqual(['keepTier1', 'keepTier2', 'keepTier3']);
    expect(territoryMapArtKeyForCell({ ...base, structureLevel: 0 })).toBe('keepTier1');
    expect(territoryMapArtKeyForCell({ ...base, structureLevel: 2 })).toBe('keepTier2');
    expect(territoryMapArtKeyForCell({ ...base, structureLevel: 99 })).toBe('keepTier3');
    for (const tier of [1, 2, 3] as const) {
      expect(TERRITORY_MAP_ART_SOURCES[`keepTier${tier}`]).toBe(`/territory_map/keep-${tier}.webp`);
    }
  });

  it('clamps out-of-range resource yields to the nearest authored tier', () => {
    const base = {
      q: 2,
      r: -3,
      biome: 'grassland' as const,
      keepRoot: false,
      resource: 'grain' as const,
    };
    expect(territoryMapArtKeyForCell({ ...base, resourceYield: 0 })).toBe('grainTier1');
    expect(territoryMapArtKeyForCell({ ...base, resourceYield: 99 })).toBe('grainTier3');
  });

  it('rotates only flat ground and keeps upright silhouettes vertical', () => {
    const flat = territoryMapArtTransformForCell({ q: 7, r: -4 }, 'grassland');
    const mountain = territoryMapArtTransformForCell({ q: 7, r: -4 }, 'mountain');
    const keep = territoryMapArtTransformForCell({ q: 7, r: -4 }, 'keepTier3');
    expect(flat.rotationSteps).toBeGreaterThanOrEqual(0);
    expect(flat.rotationSteps).toBeLessThan(6);
    expect(flat.mirrorX).toBe(false);
    expect(mountain.rotationSteps).toBe(0);
    expect(typeof mountain.mirrorX).toBe('boolean');
    expect(keep).toEqual({ rotationSteps: 0, mirrorX: false });
  });

  it('provides a full authored transition for every unordered biome pair', () => {
    expect(TERRITORY_MAP_TRANSITION_KEYS).toHaveLength(21);
    expect(new Set(TERRITORY_MAP_TRANSITION_KEYS)).toHaveLength(21);

    for (const [first, second, key] of TRANSITION_PAIRS) {
      expect(territoryMapHasAuthoredFullTransition(first, second)).toBe(true);
      expect(territoryMapHasAuthoredFullTransition(second, first)).toBe(true);
      expect(TERRITORY_MAP_ART_SOURCES[key]).toBe(
        `/territory_map/transition-${first}-${second}.webp`,
      );
      expect(
        territoryMapAuthoredTransitionForCell({
          q: 1,
          r: 2,
          biome: first,
          resource: null,
          resourceYield: 0,
          keepRoot: false,
          neighborBiomes: [second, null, null, null, null, null],
        }),
      ).toEqual({ key, rotationSteps: 0, mirrorX: false });
      expect(
        territoryMapAuthoredTransitionForCell({
          q: 1,
          r: 2,
          biome: second,
          resource: null,
          resourceYield: 0,
          keepRoot: false,
          neighborBiomes: [first, null, null, null, null, null],
        }),
      ).toBeNull();
      expect(territoryMapArtIsGround(key)).toBe(true);
    }
  });

  it('rotates the full transition tile toward its neighboring biome', () => {
    expect(
      territoryMapAuthoredTransitionForCell({
        q: 1,
        r: 2,
        biome: 'highland',
        resource: null,
        resourceYield: 0,
        keepRoot: false,
        neighborBiomes: [null, null, 'snowfield', null, null, null],
      }),
    ).toEqual({ key: 'highlandSnowfield', rotationSteps: 4, mirrorX: false });
  });

  it('uses static full-cell transitions without the old per-edge atlas pass', () => {
    expect(painterSource).toContain('territoryMapAuthoredTransitionForCell(cell)');
    expect(painterSource).not.toContain('transitionSprites');
    expect(painterSource).not.toContain('transitionAtlas');
    expect(painterSource).not.toContain('territoryTransitionAtlasFrame');
    expect(painterSource).not.toContain('createImageData');
    expect(painterSource).not.toContain("document.createElement('canvas')");
    expect(painterSource).not.toContain('tileComposer');
    expect(painterSource).not.toContain('transitionBand');
  });
});
