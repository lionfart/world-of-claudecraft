import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERRITORY_SIEGE_ASSET_URLS,
  territorySiegeAssetsInternalsForTest,
} from '../src/render/territory_siege_assets';

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

  it('uses a closed gate leaf and a compact altar core kit', () => {
    expect(TERRITORY_SIEGE_ASSET_URLS.gate).toBe('/models/biome/dungeon_gate_door.glb');
    expect(TERRITORY_SIEGE_ASSET_URLS.coreAltar).toBe('/models/props/enchanting_altar.glb');
    expect(TERRITORY_SIEGE_ASSET_URLS.coreCrystal).toBe('/models/resources/gem_large.glb');
    expect(territorySiegeAssetsInternalsForTest.urls).not.toContain(
      '/models/props/star_heart_crystal.glb',
    );
  });
});
