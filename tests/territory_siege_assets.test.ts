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
      palisadeWall: '/models/props/fenbridge_palisade_wing.glb',
      towerWood: '/models/biome/hex_watchtower.glb',
      towerStone: '/models/biome/hex_tower_cannon.glb',
      drakelandsStairsWalled: '/models/biome/kcas_stairs_walled.glb',
      drakelandsStairsWide: '/models/biome/kcas_stairs_wide.glb',
      drakelandsWall: '/models/biome/kcas_wall.glb',
      drakelandsWallWindow: '/models/biome/kcas_wall_window.glb',
      drakelandsWallPillar: '/models/biome/kcas_wall_pillar.glb',
      drakelandsBarrier: '/models/biome/kcas_barrier.glb',
      drakelandsBanner: '/models/biome/kcas_banner_red_shield.glb',
      drakelandsTorch: '/models/biome/kcas_torch_mounted.glb',
      frontierTent: '/models/biome/hexr_tent.glb',
      frontierWatchtower: '/models/biome/hexr_watchtower.glb',
      drakelandsCastle: '/models/biome/hexr_castle.glb',
      drakelandsTownhall: '/models/biome/hexr_townhall.glb',
      drakelandsBarracks: '/models/biome/hexr_barracks.glb',
      drakelandsBlacksmith: '/models/biome/hexr_blacksmith.glb',
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

  it('keeps tactical guides selection-bound and telegraphs tower impact areas', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/render/territory_siege_prototype.ts', import.meta.url)),
      'utf8',
    ).replaceAll('"', "'");
    expect(source).not.toContain('objectiveBeacon(0xd06035');
    expect(source).toContain("ring.name = 'territory-siege-tower-range'");
    expect(source).toContain("impact.root.name = 'territory-siege-tower-impact-area'");
    expect(source).toContain('territorySiegeGroundLiftLocal(x, z)');
    expect(source).toContain('territorySiegeGuideVisibility(');
    expect(source).toContain('impact.root.scale.setScalar(zone.radius)');
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
    expect(source).toContain('new THREE.DodecahedronGeometry(index === 0 ? 1.35 : 0.62, 0)');
    expect(source).toContain('Math.sin(progress * Math.PI) * 15');
    expect(source).toContain('shell.trail.quaternion.setFromUnitVectors');
    expect(source).toContain('const towerProjectiles = Array.from');
    expect(source).toContain('const towerImpactAreas = Array.from');
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
    ).replaceAll('"', "'");
    expect(source).not.toContain('buildGrassCarpet');
    expect(source).not.toContain('territory-siege-grass:');
    expect(source).toContain('buildBillboardGrass');
    expect(source).toContain('grassTuftTexture(30)');
    expect(source).toContain('new THREE.InstancedMesh');
    expect(source).toContain('buildGroundStoneScatter');
    expect(source).toContain('territorySiegeSceneryIntersectsCastle');
    expect(source).not.toContain('insideCastleCourtyard');
    expect(source).toContain('[4.2, 0.72, 4.2]');
    expect(source).toContain("place(dirt, 'frontierWatchtower'");
    expect(source).toContain("place(drakelands, 'drakelandsCastle'");
    expect(source).toContain("place(citadel, 'drakelandsBarracks'");
    expect(source).not.toContain("place(dirt, 'flag'");
    expect(source).not.toContain("place(current, 'flag'");
    expect(source).not.toContain("place(drakelands, 'flag'");
    expect(source).not.toContain("place(citadel, 'flag'");
    expect(source).toContain('TERRITORY_SIEGE_CITADEL_WALL_WALKS');
    expect(source).toContain('TERRITORY_SIEGE_CITADEL_OUTER_HOMES');
    expect(source).toContain('const wallStairTreadHeight = 5.1');
    expect(source).toContain('side > 0 ? -Math.PI / 2 : Math.PI / 2');
    expect(source).not.toContain('buildMountainBoundary');
    expect(TERRITORY_SIEGE_ASSET_URLS).not.toHaveProperty('boundaryRock');
    expect(TERRITORY_SIEGE_ASSET_URLS).not.toHaveProperty('boundaryCliff');
  });

  it('builds the level-three defense tower around the existing Drakelands castle silhouette', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/render/territory_siege_prototype.ts', import.meta.url)),
      'utf8',
    );
    const bastion = source.slice(
      source.indexOf('function buildDrakelandsBastion('),
      source.indexOf('interface ArtilleryModel'),
    );
    expect(bastion).toContain("'drakelandsCastle'");
    expect(bastion).not.toContain('new THREE.BoxGeometry');
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
