import { describe, expect, it } from 'vitest';
import {
  territoryCellClaimable,
  territoryResourceProfile,
  territoryVisualBiome,
} from '../src/sim/territory_biome';
import { createTerritoryManifest } from '../src/sim/territory_manifest';

describe('territory visual biomes', () => {
  it('keeps every strategic hex on land with no ocean or coast ring', () => {
    const manifest = createTerritoryManifest(20);
    const biomes = new Set<string>(
      manifest.cells.map((cell) => territoryVisualBiome(cell, manifest.radius)),
    );
    expect(biomes.has('ocean')).toBe(false);
    expect(biomes.has('coast')).toBe(false);
  });

  it('ties resource yield to the depicted biome density', () => {
    const manifest = createTerritoryManifest(20);
    const forest = manifest.cells.find((cell) => {
      const profile = territoryResourceProfile(cell, manifest.radius);
      return territoryVisualBiome(cell, manifest.radius) === 'forest' && profile?.kind === 'wood';
    });
    const woodland = manifest.cells.find((cell) => {
      const profile = territoryResourceProfile(cell, manifest.radius);
      return (
        territoryVisualBiome(cell, manifest.radius) === 'woodlands' && profile?.kind === 'wood'
      );
    });
    const snowForest = manifest.cells.find((cell) => {
      const profile = territoryResourceProfile(cell, manifest.radius);
      return (
        territoryVisualBiome(cell, manifest.radius) === 'snowForest' && profile?.kind === 'wood'
      );
    });
    if (!forest || !woodland || !snowForest) throw new Error('expected forest biomes are absent');

    expect(territoryResourceProfile(forest, manifest.radius)).toMatchObject({ kind: 'wood' });
    expect(territoryResourceProfile(forest, manifest.radius)?.yield).toBeGreaterThan(1);
    expect(territoryResourceProfile(woodland, manifest.radius)).toEqual({ kind: 'wood', yield: 1 });
    expect(territoryResourceProfile(snowForest, manifest.radius)).toEqual({
      kind: 'wood',
      yield: 2,
    });

    const grainTiers = new Set(
      manifest.cells
        .filter((cell) => territoryVisualBiome(cell, manifest.radius) === 'grassland')
        .map((cell) => territoryResourceProfile(cell, manifest.radius))
        .filter((profile) => profile?.kind === 'grain')
        .map((profile) => profile?.yield),
    );
    expect(grainTiers).toEqual(new Set([1, 2]));
  });

  it('forms broad cold, desert, and temperate regions instead of a random checkerboard', () => {
    const manifest = createTerritoryManifest(20);
    const biomes = new Set(
      manifest.cells.map((cell) => territoryVisualBiome(cell, manifest.radius)),
    );
    expect([...biomes].some((biome) => biome.startsWith('snow'))).toBe(true);
    expect([...biomes].some((biome) => biome.startsWith('desert'))).toBe(true);
    expect([...biomes].some((biome) => ['grassland', 'woodlands', 'forest'].includes(biome))).toBe(
      true,
    );
    expect([...biomes].some((biome) => ['highland', 'mountain'].includes(biome))).toBe(true);
  });

  it('keeps landmark biomes sparse and lets temperate ground dominate', () => {
    const manifest = createTerritoryManifest(20);
    const counts = new Map<string, number>();
    for (const cell of manifest.cells) {
      const biome = territoryVisualBiome(cell, manifest.radius);
      counts.set(biome, (counts.get(biome) ?? 0) + 1);
    }
    const count = (...biomes: string[]): number =>
      biomes.reduce((sum, biome) => sum + (counts.get(biome) ?? 0), 0);

    expect(count('grassland', 'woodlands')).toBeGreaterThan(manifest.cells.length * 0.55);
    expect(count('mountain', 'snowMountain')).toBeLessThan(manifest.cells.length * 0.08);
    expect(count('snowfield', 'snowForest', 'snowMountain')).toBeLessThan(
      manifest.cells.length * 0.16,
    );
    expect(count('desert', 'desertMesa')).toBeLessThan(manifest.cells.length * 0.12);
    expect(count('forest')).toBeLessThan(manifest.cells.length * 0.08);
    expect(count('woodlands', 'forest', 'snowForest')).toBeLessThan(manifest.cells.length * 0.18);
  });

  it('makes every mountain ridge unclaimable and non-producing', () => {
    const manifest = createTerritoryManifest(20);
    const mountains = manifest.cells.filter((cell) =>
      ['mountain', 'snowMountain'].includes(territoryVisualBiome(cell, manifest.radius)),
    );
    expect(mountains.length).toBeGreaterThan(0);
    for (const cell of mountains) {
      expect(territoryCellClaimable(cell, manifest.radius)).toBe(false);
      expect(territoryResourceProfile(cell, manifest.radius)).toBeNull();
    }
  });

  it('keeps wood, iron, grain, and labour deposit counts in the same economy band', () => {
    for (const radius of [20, 44]) {
      const manifest = createTerritoryManifest(radius);
      const counts = new Map<string, number>();
      for (const cell of manifest.cells) {
        const resource = territoryResourceProfile(cell, manifest.radius);
        if (resource) counts.set(resource.kind, (counts.get(resource.kind) ?? 0) + 1);
      }
      const values = ['wood', 'iron', 'grain', 'labor'].map((kind) => counts.get(kind) ?? 0);
      expect(Math.min(...values)).toBeGreaterThan(50);
      expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.5);
    }
  });

  it('is visual-only and leaves the authoritative manifest checksum untouched', () => {
    const before = createTerritoryManifest(20).checksum;
    for (const cell of createTerritoryManifest(20).cells) territoryVisualBiome(cell, 20);
    expect(createTerritoryManifest(20).checksum).toBe(before);
  });
});
