import * as THREE from 'three';
import { loadGltf, loadTexture } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';

export const TERRITORY_SIEGE_ASSET_URLS = {
  castle: '/models/biome/hex_castle.glb',
  wall: '/models/biome/hex_wall.glb',
  tower: '/models/biome/hex_tower.glb',
  workshop: '/models/biome/hex_blacksmith.glb',
  cart: '/models/props/cart.glb',
  log: '/models/resources/wood_log_a.glb',
  coreAltar: '/models/props/enchanting_altar.glb',
  coreCrystal: '/models/resources/gem_large.glb',
  rock: '/models/foliage/rock_1.glb',
  bush: '/models/foliage/bush.glb',
  bushFlowers: '/models/foliage/bush_flowers.glb',
  fern: '/models/foliage/fern.glb',
  naturalPine: '/models/foliage/pine_2.glb',
  naturalOak: '/models/foliage/oak_3.glb',
  boundaryRock: '/models/biome/desert_rock_formation_1.glb',
  boundaryCliff: '/models/props/wildheart_limestone_cliff.glb',
  homeA: '/models/biome/hex_home_a.glb',
  homeB: '/models/biome/hex_home_b.glb',
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
} as const;

export type TerritorySiegeAssetKey = keyof typeof TERRITORY_SIEGE_ASSET_URLS;
export type TerritorySiegeTextureKey = keyof typeof TERRITORY_SIEGE_TEXTURE_URLS;

const sources = new Map<TerritorySiegeAssetKey, THREE.Group>();
const textureSources = new Map<TerritorySiegeTextureKey, THREE.Texture>();

if (typeof window !== 'undefined') {
  registerDeferredPreload(async () => {
    await Promise.all([
      ...(Object.entries(TERRITORY_SIEGE_ASSET_URLS) as [TerritorySiegeAssetKey, string][]).map(
        async ([key, url]) => {
          const gltf = await loadGltf(url);
          sources.set(key, gltf.scene);
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
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
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
