import { describe, expect, it } from 'vitest';
import { territoryVisualBiome } from '../src/sim/territory_biome';
import { axialDistance, createTerritoryManifest } from '../src/sim/territory_manifest';

describe('territory visual biomes', () => {
  it('wraps the strategic continent in a complete ocean rim', () => {
    const manifest = createTerritoryManifest(20);
    const rim = manifest.cells.filter((cell) => axialDistance(cell.q, cell.r) >= 19);
    expect(rim.length).toBeGreaterThan(0);
    expect(new Set(rim.map((cell) => territoryVisualBiome(cell, manifest.radius)))).toEqual(
      new Set(['ocean']),
    );
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

  it('is visual-only and leaves the authoritative manifest checksum untouched', () => {
    const before = createTerritoryManifest(20).checksum;
    for (const cell of createTerritoryManifest(20).cells) territoryVisualBiome(cell, 20);
    expect(createTerritoryManifest(20).checksum).toBe(before);
  });
});
