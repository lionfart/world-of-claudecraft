import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERRITORY_SIEGE_ASSET_URLS,
  TERRITORY_SIEGE_TEXTURE_URLS,
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

  it('drops the arched gate asset in favor of a fitted leaf and keeps the compact core kit', () => {
    expect(TERRITORY_SIEGE_ASSET_URLS).not.toHaveProperty('gate');
    expect(territorySiegeAssetsInternalsForTest.urls).not.toContain(
      '/models/biome/dungeon_gate_door.glb',
    );
    expect(TERRITORY_SIEGE_ASSET_URLS.coreAltar).toBe('/models/props/enchanting_altar.glb');
    expect(TERRITORY_SIEGE_ASSET_URLS.coreCrystal).toBe('/models/resources/gem_large.glb');
    expect(territorySiegeAssetsInternalsForTest.urls).not.toContain(
      '/models/props/star_heart_crystal.glb',
    );
  });

  it('builds the battlefield from optimized natural and settlement assets', () => {
    expect(TERRITORY_SIEGE_ASSET_URLS).toMatchObject({
      naturalPine: '/models/foliage/pine_2.glb',
      naturalOak: '/models/foliage/oak_3.glb',
      fern: '/models/foliage/fern.glb',
      rock: '/models/foliage/rock_1.glb',
      bush: '/models/foliage/bush.glb',
      homeA: '/models/biome/hex_home_a.glb',
      homeB: '/models/biome/hex_home_b.glb',
      roadA: '/models/dungeon/path_a.glb',
      well: '/models/biome/hex_well.glb',
    });
  });

  it('preloads tiled PBR grass and dirt surfaces for the siege field', () => {
    expect(TERRITORY_SIEGE_TEXTURE_URLS).toMatchObject({
      grassColor: '/textures/terrain/Grass001_Color.jpg',
      grassNormal: '/textures/terrain/Grass001_NormalGL.jpg',
      dirtColor: '/textures/terrain/Ground023_Color.jpg',
      dirtNormal: '/textures/terrain/Ground023_NormalGL.jpg',
    });
    for (const url of territorySiegeAssetsInternalsForTest.textureUrls) {
      expect(existsSync(fileURLToPath(new URL(`../public${url}`, import.meta.url))), url).toBe(
        true,
      );
    }
  });

  it('keeps only the ram apron at the gate and exposes terrain-following tower ranges', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/render/territory_siege_prototype.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toContain('objectiveBeacon(0xd06035');
    expect(source).toContain("ring.name = 'territory-siege-tower-range'");
    expect(source).toContain('territorySiegeGroundLiftLocal(x, z)');
  });

  it('uses instanced billboard grass and clustered dressing instead of the old spike carpet', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/render/territory_siege_environment.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toContain('buildGrassCarpet');
    expect(source).not.toContain('territory-siege-grass:');
    expect(source).toContain('buildBillboardGrass');
    expect(source).toContain('grassTuftTexture(30)');
    expect(source).toContain('new THREE.InstancedMesh');
    expect(source).toContain('buildGroundStoneScatter');
    expect(source).toContain('[4.2, 0.72, 4.2]');
  });

  it('replicates every active core channel instead of rendering only the local beam', () => {
    const prototype = readFileSync(
      fileURLToPath(new URL('../src/render/territory_siege_prototype.ts', import.meta.url)),
      'utf8',
    );
    const runtime = readFileSync(
      fileURLToPath(new URL('../server/territory_game_runtime.ts', import.meta.url)),
      'utf8',
    );
    expect(prototype).toContain('siege?.coreChannels');
    expect(runtime).toContain('coreChannelCharacters(siege.warId)');
  });
});
