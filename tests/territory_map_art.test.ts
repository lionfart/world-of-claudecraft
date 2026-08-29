import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TERRITORY_MAP_ART_SOURCES } from '../src/ui/territory_map_art';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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
});
