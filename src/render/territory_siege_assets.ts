import type * as THREE from 'three';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';

export const TERRITORY_SIEGE_ASSET_URLS = {
  castle: '/models/biome/hex_castle.glb',
  wall: '/models/biome/hex_wall.glb',
  tower: '/models/biome/hex_tower.glb',
  workshop: '/models/biome/hex_blacksmith.glb',
  gate: '/models/dungeon/wooden_gate.glb',
  cart: '/models/props/cart.glb',
  log: '/models/resources/wood_log_a.glb',
  core: '/models/props/star_heart_crystal.glb',
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
