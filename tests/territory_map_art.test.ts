import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERRITORY_MAP_ART_SOURCES,
  territoryFeatureArtRect,
  territoryTerrainArtRect,
  territoryTerrainArtSourceRect,
} from '../src/ui/territory_map_art';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const painterSource = readFileSync(join(repoRoot, 'src', 'ui', 'territory_map_painter.ts'), 'utf8');

describe('territory map art bundle', () => {
  it('ships one bounded lossless WebP tile for every terrain, resource, and keep key', () => {
    const sources = Object.values(TERRITORY_MAP_ART_SOURCES);
    expect(sources).toHaveLength(10);
    expect(new Set(sources).size).toBe(sources.length);

    let totalBytes = 0;
    for (const source of sources) {
      expect(source).toMatch(/^\/territory_map\/[a-z]+\.webp$/);
      const file = join(repoRoot, 'public', source.slice(1));
      const bytes = readFileSync(file);
      totalBytes += statSync(file).size;
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(bytes.length).toBeLessThan(100_000);
    }
    expect(totalBytes).toBeLessThan(800_000);
  });

  it('covers the exact flat-top hex bounds with terrain texture', () => {
    const radius = 20;
    const rect = territoryTerrainArtRect(100, 80, radius);
    const halfHexHeight = (Math.sqrt(3) * radius) / 2;
    expect(rect.x).toBe(80);
    expect(rect.width).toBe(40);
    expect(rect.y).toBeCloseTo(80 - halfHexHeight, 8);
    expect(rect.y + rect.height).toBeCloseTo(80 + halfHexHeight, 8);
  });

  it('samples the fully opaque centre patch of the supplied 256x384 terrain art', () => {
    expect(territoryTerrainArtSourceRect(256, 384)).toEqual({
      sx: 64,
      sy: 184,
      sw: 128,
      sh: 72,
    });
  });

  it('keeps the full keep and resource silhouette inside one hex', () => {
    const radius = 20;
    const rect = territoryFeatureArtRect(100, 80, radius);
    const halfHexHeight = (Math.sqrt(3) * radius) / 2;
    expect(rect.y).toBeGreaterThan(80 - halfHexHeight);
    expect(rect.y + rect.height).toBeLessThanOrEqual(80 + halfHexHeight);
    expect(rect.x).toBeGreaterThan(80);
    expect(rect.x + rect.width).toBeLessThan(120);
    expect(rect.height / rect.width).toBeCloseTo(384 / 256, 8);
  });

  it('cover-crops terrain and clips both art layers to the flat-top canvas path', () => {
    expect(painterSource).toContain('territoryTerrainArtRect(');
    expect(painterSource).toContain('territoryTerrainArtSourceRect(');
    expect(painterSource).toContain('territoryFeatureArtRect(');
    expect(painterSource).toContain('this.hexPath(ctx, cell, 0.16);');
    expect(painterSource).toContain('ctx.clip();');
  });
});
