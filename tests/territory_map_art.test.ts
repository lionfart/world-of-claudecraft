import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERRITORY_MAP_ART_SOURCES,
  TERRITORY_TRANSITION_ATLAS_CELL_HEIGHT,
  TERRITORY_TRANSITION_ATLAS_CELL_WIDTH,
  TERRITORY_TRANSITION_ATLAS_COLUMNS,
  TERRITORY_TRANSITION_ATLAS_ROWS,
  TERRITORY_TRANSITION_MATERIALS,
  territoryFeatureArtRect,
  territoryMapArtIsGround,
  territoryMapAuthoredTransitionForCell,
  territoryMapArtKeyForCell,
  territoryMapArtTransformForCell,
  territoryTerrainArtRect,
  territoryTransitionArtKey,
  territoryTransitionAtlasFrame,
} from '../src/ui/territory_map_art';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const painterSource = readFileSync(join(repoRoot, 'src', 'ui', 'territory_map_painter.ts'), 'utf8');

describe('territory map art bundle', () => {
  it('ships a bounded optimized WebP bundle for terrain, resources, keep, and transitions', () => {
    const sources = Object.values(TERRITORY_MAP_ART_SOURCES);
    expect(sources).toHaveLength(31);
    expect(new Set(sources).size).toBe(sources.length);

    let totalBytes = 0;
    for (const source of sources) {
      expect(source).toMatch(/^\/territory_map\/[a-z-]+\.webp$/);
      const file = join(repoRoot, 'public', source.slice(1));
      const bytes = readFileSync(file);
      totalBytes += statSync(file).size;
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(bytes.length).toBeLessThan(source.includes('transition-atlas') ? 250_000 : 120_000);
    }
    expect(totalBytes).toBeLessThan(2_500_000);
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
    expect(territoryTransitionArtKey('marsh', 'mountain', 1, 2, 0)).toMatch(/^highland/);
    expect(territoryTransitionArtKey('marsh', 'snowMountain', 1, 2, 1)).toMatch(/^snowfield/);
    expect(territoryTransitionArtKey('marsh', 'forest', 1, 2, 2)).toBe('woodlands');
    expect(territoryTransitionArtKey('marsh', 'desertMesa', 1, 2, 3)).toMatch(/^desert/);
    expect(territoryTransitionArtKey('grassland', 'forest', 1, 2, 0)).toBe('grasslandWoodlands');
    expect(territoryTransitionArtKey('forest', 'grassland', 1, 2, 0)).toBe('woodlandsGrassland');
    expect(territoryTransitionArtKey('highland', 'snowfield', 1, 2, 0)).toBe('highlandSnowfield');
    expect(painterSource).toContain('for (const cell of sorted) {\n      this.transitionSprites(');
    expect(painterSource).toContain('territoryTransitionAtlasFrame(key, side)');
    expect(painterSource).not.toContain('createImageData');
    expect(painterSource).not.toContain("document.createElement('canvas')");
    expect(painterSource).not.toContain('tileComposer');
    expect(painterSource).not.toContain('transitionBand');
  });

  it('uses the generated full-cell transition paintings on matching biome borders', () => {
    const base = {
      q: 1,
      r: 2,
      biome: 'grassland' as const,
      resource: null,
      resourceYield: 0,
      keepRoot: false,
      neighborBiomes: ['forest', null, null, null, null, null] as const,
    };
    expect(territoryMapAuthoredTransitionForCell(base)).toEqual({
      key: 'grasslandWoodlands',
      rotationSteps: 0,
      mirrorX: false,
    });
    expect(
      territoryMapAuthoredTransitionForCell({
        ...base,
        biome: 'highland',
        neighborBiomes: [null, null, 'snowfield', null, null, null],
      }),
    ).toEqual({ key: 'highlandSnowfield', rotationSteps: 2, mirrorX: false });
    expect(territoryMapArtIsGround('grasslandWoodlands')).toBe(true);
    expect(territoryMapArtIsGround('mountain')).toBe(false);
    expect(painterSource).toContain('const groundScale = 1.16');
  });

  it('addresses every material/direction sprite without overlap', () => {
    const frames = TERRITORY_TRANSITION_MATERIALS.flatMap((key) =>
      Array.from({ length: 6 }, (_, side) => territoryTransitionAtlasFrame(key, side)),
    );
    expect(TERRITORY_TRANSITION_MATERIALS).toHaveLength(22);
    expect(frames).toHaveLength(132);
    expect(new Set(frames.map((frame) => `${frame.x},${frame.y}`))).toHaveLength(132);
    for (const frame of frames) {
      expect(frame.x + frame.width).toBeLessThanOrEqual(
        TERRITORY_TRANSITION_ATLAS_COLUMNS * TERRITORY_TRANSITION_ATLAS_CELL_WIDTH,
      );
      expect(frame.y + frame.height).toBeLessThanOrEqual(
        TERRITORY_TRANSITION_ATLAS_ROWS * TERRITORY_TRANSITION_ATLAS_CELL_HEIGHT,
      );
    }
  });
});
