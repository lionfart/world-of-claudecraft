import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERRITORY_SIEGE_ASSET_URLS,
  TERRITORY_SIEGE_TEXTURE_URLS,
  territorySiegeAssetObjectVisible,
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
      snowPineA: '/models/foliage/snow_pine_1.glb',
      snowPineB: '/models/foliage/snow_pine_2.glb',
      snowPineC: '/models/foliage/snow_pine_3.glb',
      snowRockA: '/models/foliage/snow_rock_1.glb',
      snowRockB: '/models/foliage/snow_rock_2.glb',
      snowRockC: '/models/foliage/snow_rock_3.glb',
      desertTree: '/models/biome/desert_tree.glb',
      desertBoulderA: '/models/biome/desert_boulder_1.glb',
      desertCactusA: '/models/biome/desert_cactus_tall_1.glb',
      catapult: '/models/siege/territory_catapult.glb',
      fern: '/models/foliage/fern.glb',
      rock: '/models/foliage/rock_1.glb',
      bush: '/models/foliage/bush.glb',
      homeA: '/models/biome/hex_home_a.glb',
      homeB: '/models/biome/hex_home_b.glb',
      roadA: '/models/dungeon/path_a.glb',
      well: '/models/biome/hex_well.glb',
    });
  });

  it('does not render material-less collision helpers shipped inside cactus GLBs', () => {
    expect(territorySiegeAssetObjectVisible('Cactus_Tall_1-colonly')).toBe(false);
    expect(territorySiegeAssetObjectVisible('Cactus_Small_1-colonly')).toBe(false);
    expect(territorySiegeAssetObjectVisible('Cactus_Tall_1')).toBe(true);
  });

  it('preloads tiled PBR surfaces for every siege biome', () => {
    expect(TERRITORY_SIEGE_TEXTURE_URLS).toMatchObject({
      grassColor: '/textures/terrain/Grass001_Color.jpg',
      grassNormal: '/textures/terrain/Grass001_NormalGL.jpg',
      dirtColor: '/textures/terrain/Ground023_Color.jpg',
      dirtNormal: '/textures/terrain/Ground023_NormalGL.jpg',
      snowColor: '/textures/terrain/Snow010A_Color.jpg',
      snowNormal: '/textures/terrain/Snow010A_NormalGL.jpg',
      sandColor: '/textures/terrain/Ground093A_Color.jpg',
      sandNormal: '/textures/terrain/Ground093A_NormalGL.jpg',
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
    expect(source).toContain('fittedGate.root.userData.territorySiegeObjective = {');
    expect(source).toContain("kind: 'wall'");
    expect(source).toContain("kind: 'tower'");
    expect(source).toContain("kind: 'ram'");
    expect(source).toContain("kind: 'mortar'");
    expect(source).toContain("kind: 'catapult'");
    expect(source).toContain("selection.root.name = 'territory-siege-objective-selection'");
    expect(source).not.toContain('const gateHealth = buildStructureHealthPlate()');
    expect(source).toContain('coreHealth.sprite.position.set(0, 7.15');
    expect(source).toContain('const mortarProjectiles = Array.from');
    expect(source).toContain('if (Math.min(view.launchesIn, locallyLaunchRemaining) > 0) continue');
    expect(source).toContain('turnTowardYaw(');
    expect(source).toContain('root.name = `territory-siege-${key}-yaw-pivot`');
    expect(source).toContain('mortarRecoilStartedAt.set(shot.mortarId, timeSeconds)');
    expect(source).toContain('catapultRecoilStartedAt.set(shot.catapultId, timeSeconds)');
    expect(source).not.toContain('const normalRecoilAge = 7 - view.cooldown');
    expect(source).toContain('new THREE.DodecahedronGeometry(1.32, 1)');
    expect(source).toContain('Math.sin(progress * Math.PI) * 15');
    expect(source).toContain('shell.trail.quaternion.setFromUnitVectors');
    expect(source).toContain('const towerProjectiles = Array.from');
    expect(source).not.toContain('const towerWarnings = Array.from');
    expect(source).not.toContain('const mortarWarnings = Array.from');
  });

  it('uses the generated painted siege ability set in every temporary hotbar', () => {
    const css = readFileSync(
      fileURLToPath(new URL('../src/styles/components.css', import.meta.url)),
      'utf8',
    );
    const mappingPath = fileURLToPath(
      new URL('../public/ui/skills/territory/mapping.json', import.meta.url),
    );
    const mapping = JSON.parse(readFileSync(mappingPath, 'utf8')) as {
      source: string;
      entries: Array<{ ability: string; file: string }>;
    };
    expect(mapping.source).toBe('OpenAI built-in image generation');
    expect(mapping.entries).toHaveLength(7);
    for (const entry of mapping.entries) {
      expect(
        existsSync(
          fileURLToPath(new URL(`../public/ui/skills/territory/${entry.file}`, import.meta.url)),
        ),
        entry.ability,
      ).toBe(true);
      expect(css).toContain(`/ui/skills/territory/${entry.file}`);
    }
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
    expect(source).not.toContain('buildMountainBoundary');
    expect(TERRITORY_SIEGE_ASSET_URLS).not.toHaveProperty('boundaryRock');
    expect(TERRITORY_SIEGE_ASSET_URLS).not.toHaveProperty('boundaryCliff');
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
