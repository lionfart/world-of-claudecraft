import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { territorySiegeAssetsInternalsForTest } from '../src/render/territory_siege_assets';

describe('territory siege asset kit', () => {
  it('uses unique optimized models already shipped by the game', () => {
    const urls = territorySiegeAssetsInternalsForTest.urls;
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(url.endsWith('.glb')).toBe(true);
      expect(existsSync(fileURLToPath(new URL(`../public${url}`, import.meta.url))), url).toBe(
        true,
      );
    }
  });
});
