import * as THREE from 'three';
import { loadGltf, loadTexture } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';

export const TERRITORY_SIEGE_ASSET_URLS = {
  castle: '/models/biome/hex_castle.glb',
  palisadeWall: '/models/props/fenbridge_palisade_wing.glb',
  wall: '/models/biome/hex_wall.glb',
  drakelandsWall: '/models/biome/kcas_wall.glb',
  drakelandsWallWindow: '/models/biome/kcas_wall_window.glb',
  drakelandsWallPillar: '/models/biome/kcas_wall_pillar.glb',
  drakelandsBarrier: '/models/biome/kcas_barrier.glb',
  drakelandsBanner: '/models/biome/kcas_banner_red_shield.glb',
  drakelandsTorch: '/models/biome/kcas_torch_mounted.glb',
  drakelandsStairsWalled: '/models/biome/kcas_stairs_walled.glb',
  drakelandsStairsWide: '/models/biome/kcas_stairs_wide.glb',
  towerWood: '/models/biome/hex_watchtower.glb',
  towerStone: '/models/biome/hex_tower_cannon.glb',
  workshop: '/models/biome/hex_blacksmith.glb',
  cart: '/models/props/cart.glb',
  log: '/models/resources/wood_log_a.glb',
  mortar: '/models/biome/beach_cannon.glb',
  catapult: '/models/siege/territory_catapult.glb',
  coreAltar: '/models/props/enchanting_altar.glb',
  coreCrystal: '/models/resources/gem_large.glb',
  rock: '/models/foliage/rock_1.glb',
  bush: '/models/foliage/bush.glb',
  bushFlowers: '/models/foliage/bush_flowers.glb',
  fern: '/models/foliage/fern.glb',
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
  desertBoulderB: '/models/biome/desert_boulder_2.glb',
  desertCactusA: '/models/biome/desert_cactus_tall_1.glb',
  desertCactusB: '/models/biome/desert_cactus_small.glb',
  homeA: '/models/biome/hex_home_a.glb',
  homeB: '/models/biome/hex_home_b.glb',
  frontierTent: '/models/biome/hexr_tent.glb',
  frontierWatchtower: '/models/biome/hexr_watchtower.glb',
  drakelandsCastle: '/models/biome/hexr_castle.glb',
  drakelandsTownhall: '/models/biome/hexr_townhall.glb',
  drakelandsBarracks: '/models/biome/hexr_barracks.glb',
  drakelandsBlacksmith: '/models/biome/hexr_blacksmith.glb',
  drakelandsHomeA: '/models/biome/hexr_home_a.glb',
  drakelandsHomeB: '/models/biome/hexr_home_b.glb',
  well: '/models/biome/hex_well.glb',
  roadA: '/models/dungeon/path_a.glb',
  roadB: '/models/dungeon/path_b.glb',
  flag: '/models/biome/hex_flag_red.glb',
  hay: '/models/biome/hex_haybale.glb',
} as const;

export const TERRITORY_SIEGE_TEXTURE_URLS = {
  grassColor: '/textures/terrain/Grass001_Color.jpg',
  grassNormal: '/textures/terrain/Grass001_NormalGL.jpg',
  grassRoughness: '/textures/terrain/Grass001_Roughness.jpg',
  dirtColor: '/textures/terrain/Ground023_Color.jpg',
  dirtNormal: '/textures/terrain/Ground023_NormalGL.jpg',
  dirtRoughness: '/textures/terrain/Ground023_Roughness.jpg',
  snowColor: '/textures/terrain/Snow010A_Color.jpg',
  snowNormal: '/textures/terrain/Snow010A_NormalGL.jpg',
  snowRoughness: '/textures/terrain/Snow010A_Roughness.jpg',
  sandColor: '/textures/terrain/Ground093A_Color.jpg',
  sandNormal: '/textures/terrain/Ground093A_NormalGL.jpg',
} as const;

export type TerritorySiegeAssetKey = keyof typeof TERRITORY_SIEGE_ASSET_URLS;
export type TerritorySiegeTextureKey = keyof typeof TERRITORY_SIEGE_TEXTURE_URLS;

const sources = new Map<TerritorySiegeAssetKey, THREE.Group>();
const sourceHeights = new Map<TerritorySiegeAssetKey, number>();
const textureSources = new Map<TerritorySiegeTextureKey, THREE.Texture>();

/** Catalogue GLBs sometimes carry visible collision-only meshes with no material. */
export function territorySiegeAssetObjectVisible(name: string): boolean {
  return !/(?:^|[-_.])colonly(?:$|[-_.])/i.test(name);
}

if (typeof window !== 'undefined') {
  registerDeferredPreload(async () => {
    await Promise.all([
      ...(Object.entries(TERRITORY_SIEGE_ASSET_URLS) as [TerritorySiegeAssetKey, string][]).map(
        async ([key, url]) => {
          const gltf = await loadGltf(url);
          sources.set(key, gltf.scene);
          gltf.scene.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(gltf.scene);
          sourceHeights.set(key, Math.max(0.001, bounds.max.y - bounds.min.y));
        },
      ),
      ...(Object.entries(TERRITORY_SIEGE_TEXTURE_URLS) as [TerritorySiegeTextureKey, string][]).map(
        async ([key, url]) => {
          const texture = await loadTexture(url, {
            srgb: key.endsWith('Color'),
            repeat: true,
          });
          textureSources.set(key, texture);
        },
      ),
    ]);
  });
}

/**
 * Clone an immutable, preloaded siege-kit scene. Geometry, textures, and
 * materials remain shared between the four arena slots.
 */
export function cloneTerritorySiegeAsset(key: TerritorySiegeAssetKey): THREE.Group {
  const source = sources.get(key);
  if (!source) throw new Error(`territory siege asset not preloaded: ${key}`);
  const clone = source.clone(true);
  clone.name = `territory-siege-asset:${key}`;
  clone.traverse((object) => {
    if (!territorySiegeAssetObjectVisible(object.name)) {
      object.visible = false;
      return;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return clone;
}

/** Clone a catalogue biome prop at a predictable world-space height. */
export function cloneTerritorySiegeAssetAtHeight(
  key: TerritorySiegeAssetKey,
  height: number,
): THREE.Group {
  const clone = cloneTerritorySiegeAsset(key);
  clone.scale.setScalar(Math.max(0.001, height) / (sourceHeights.get(key) ?? 1));
  return clone;
}

/** A caller-owned texture view with shared decoded pixels and independent tiling. */
export function cloneTerritorySiegeTexture(
  key: TerritorySiegeTextureKey,
  repeatX: number,
  repeatY: number,
): THREE.Texture {
  const source = textureSources.get(key);
  if (!source) throw new Error(`territory siege texture not preloaded: ${key}`);
  const texture = source.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

export const territorySiegeAssetsInternalsForTest = {
  urls: Object.values(TERRITORY_SIEGE_ASSET_URLS),
  textureUrls: Object.values(TERRITORY_SIEGE_TEXTURE_URLS),
};
