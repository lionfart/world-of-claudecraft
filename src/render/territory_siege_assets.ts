import type * as THREE from 'three';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';

export const TERRITORY_SIEGE_ASSET_URLS = {
  castle: '/models/biome/hex_castle.glb',
  wall: '/models/biome/hex_wall.glb',
  tower: '/models/biome/hex_tower.glb',
  workshop: '/models/biome/hex_blacksmith.glb',
  gate: '/models/biome/dungeon_gate_door.glb',
  cart: '/models/props/cart.glb',
  log: '/models/resources/wood_log_a.glb',
  coreAltar: '/models/props/enchanting_altar.glb',
  coreCrystal: '/models/resources/gem_large.glb',
  treePineLarge: '/models/dungeon/tree_pine_orange_large.glb',
  treePineMedium: '/models/dungeon/tree_pine_yellow_medium.glb',
  rock: '/models/foliage/rock_1.glb',
  bush: '/models/foliage/bush.glb',
  homeA: '/models/biome/hex_home_a.glb',
  homeB: '/models/biome/hex_home_b.glb',
  well: '/models/biome/hex_well.glb',
  roadA: '/models/dungeon/path_a.glb',
  roadB: '/models/dungeon/path_b.glb',
  flag: '/models/biome/hex_flag_red.glb',
  hay: '/models/biome/hex_haybale.glb',
} as const;

export type TerritorySiegeAssetKey = keyof typeof TERRITORY_SIEGE_ASSET_URLS;

const sources = new Map<TerritorySiegeAssetKey, THREE.Group>();

if (typeof window !== 'undefined') {
  registerDeferredPreload(() =>
    Promise.all(
      (Object.entries(TERRITORY_SIEGE_ASSET_URLS) as [TerritorySiegeAssetKey, string][]).map(
        async ([key, url]) => {
          const gltf = await loadGltf(url);
          sources.set(key, gltf.scene);
        },
      ),
    ),
  );
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
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return clone;
}

export const territorySiegeAssetsInternalsForTest = {
  urls: Object.values(TERRITORY_SIEGE_ASSET_URLS),
};
