import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERRITORY_MAP_ART_SOURCES,
  territoryFeatureArtRect,
  territoryTerrainArtRect,
} from '../src/ui/territory_map_art';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const painterSource = readFileSync(join(repoRoot, 'src', 'ui', 'territory_map_painter.ts'), 'utf8');

describe('territory map art bundle', () => {
  it('ships one bounded lossless WebP tile for every terrain, resource, and keep key', () => {
    const sources = Object.values(TERRITORY_MAP_ART_SOURCES);
    expect(sources).toHaveLength(19);
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
    expect(totalBytes).toBeLessThan(1_800_000);
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
    expect(painterSource).toContain('const image = this.artForCell(cell, art);');
    expect(painterSource).toContain(
      'ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);',
    );
    expect(painterSource).not.toContain('territoryTerrainArtSourceRect(');
  });
});
