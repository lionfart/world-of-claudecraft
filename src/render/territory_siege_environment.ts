import * as THREE from 'three';
import type { TerritorySiegeBiome } from '../sim/territory_siege_biome';
import {
  TERRITORY_SIEGE_BUSHES,
  TERRITORY_SIEGE_CITADEL_OUTER_HOMES,
  TERRITORY_SIEGE_ROCKS,
  TERRITORY_SIEGE_TREES,
  territorySiegeResourceBuildingPlacement,
} from '../sim/territory_siege_environment';
import {
  TERRITORY_SIEGE_CITADEL_INNER_BACK_Z,
  TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z,
  TERRITORY_SIEGE_CITADEL_INNER_HALF_X,
  TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
  TERRITORY_SIEGE_CITADEL_WALL_WALKS,
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  TERRITORY_SIEGE_VISUAL_MARGIN,
  territorySiegeGroundLiftLocal,
  territorySiegeTerrainLiftLocal,
} from '../sim/territory_siege_ground';
import {
  TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
  territorySiegeCastleBounds,
  territorySiegeSceneryIntersectsCastle,
} from '../sim/territory_siege_layout';
import type { TerritoryStructureSlot, TerritoryStructureView } from '../world_api';
import { castlePavingMat, FLAGSTONE_TILE_YD, tileCastleUv } from './castle_stone';
import { surfaceMat } from './gfx';
import {
  cloneTerritorySiegeAsset,
  cloneTerritorySiegeAssetAtHeight,
  cloneTerritorySiegeTexture,
  type TerritorySiegeAssetKey,
  type TerritorySiegeTextureKey,
} from './territory_siege_assets';
import { showTerritoryCastleTier } from './territory_siege_castle_visual';
import { territorySiegeGrassPlacements } from './territory_siege_grass_core';
import { grassTuftTexture } from './textures';

function place(
  parent: THREE.Object3D,
  key: TerritorySiegeAssetKey,
  x: number,
  y: number,
  z: number,
  scale: number | readonly [number, number, number],
  yaw: number,
): THREE.Group {
  const asset = cloneTerritorySiegeAsset(key);
  asset.position.set(x, y, z);
  if (typeof scale === 'number') asset.scale.setScalar(scale);
  else asset.scale.set(...scale);
  asset.rotation.y = yaw;
  parent.add(asset);
  return asset;
}

type FieldSurface = 'grass' | 'dirt' | 'snow' | 'sand';

interface TerritorySiegeFieldStyle {
  surface: FieldSurface;
  terrainBase: number;
  soil: number;
  ridge: number;
  roadSurface: FieldSurface;
  roadTint: number;
  patchSurface: FieldSurface;
  patchTint: number;
  patchOpacity: number;
  stonePatches: number;
  stoneScale: number;
  stoneColors: readonly [number, number];
}

const FIELD_STYLES: Record<TerritorySiegeBiome, TerritorySiegeFieldStyle> = {
  temperate: {
    surface: 'grass',
    terrainBase: 0xf0f9e5,
    soil: 0xc2a778,
    ridge: 0x68685d,
    roadSurface: 'dirt',
    roadTint: 0xa89172,
    patchSurface: 'dirt',
    patchTint: 0xffffff,
    patchOpacity: 0.72,
    stonePatches: 42,
    stoneScale: 1,
    stoneColors: [0x77766b, 0x5d6258],
  },
  rocky: {
    surface: 'dirt',
    terrainBase: 0xc8b28c,
    soil: 0x8e7a5f,
    ridge: 0x595951,
    roadSurface: 'dirt',
    roadTint: 0x786653,
    patchSurface: 'dirt',
    patchTint: 0x726452,
    patchOpacity: 0.46,
    stonePatches: 72,
    stoneScale: 1.32,
    stoneColors: [0x858078, 0x66635e],
  },
  snow: {
    surface: 'snow',
    terrainBase: 0xffffff,
    soil: 0xd7e4eb,
    ridge: 0x99aab5,
    roadSurface: 'snow',
    roadTint: 0xb8c7d1,
    patchSurface: 'dirt',
    patchTint: 0x8f9697,
    patchOpacity: 0.3,
    stonePatches: 36,
    stoneScale: 1.08,
    stoneColors: [0xd6dde0, 0xa8b2b8],
  },
  desert: {
    surface: 'sand',
    terrainBase: 0xffe0a0,
    soil: 0xc69252,
    ridge: 0x8f6442,
    roadSurface: 'sand',
    roadTint: 0xc89a5b,
    patchSurface: 'dirt',
    patchTint: 0xb07a43,
    patchOpacity: 0.3,
    stonePatches: 58,
    stoneScale: 1.18,
    stoneColors: [0xb58b5d, 0x8a6445],
  },
};

const surfaceMaterials = new Map<string, THREE.Material>();
const patchMaterials = new Map<TerritorySiegeBiome, THREE.Material>();
let siegeGrassMaterial: THREE.MeshStandardMaterial | null = null;
let siegeSnowGrassMaterial: THREE.MeshStandardMaterial | null = null;

const SURFACE_TEXTURES: Record<
  FieldSurface,
  {
    color: TerritorySiegeTextureKey;
    normal: TerritorySiegeTextureKey;
    roughness: TerritorySiegeTextureKey;
  }
> = {
  grass: {
    color: 'grassColor',
    normal: 'grassNormal',
    roughness: 'grassRoughness',
  },
  dirt: {
    color: 'dirtColor',
    normal: 'dirtNormal',
    roughness: 'dirtRoughness',
  },
  snow: {
    color: 'snowColor',
    normal: 'snowNormal',
    roughness: 'snowRoughness',
  },
  sand: {
    color: 'sandColor',
    normal: 'sandNormal',
    roughness: 'dirtRoughness',
  },
};

function texturedMaterial(
  kind: FieldSurface,
  tint: number,
  repeatX: number,
  repeatY: number,
  vertexColors: boolean,
): THREE.Material {
  const cacheKey = `${kind}:${tint}:${repeatX}:${repeatY}:${vertexColors ? 1 : 0}`;
  const cached = surfaceMaterials.get(cacheKey);
  if (cached) return cached;
  const textures = SURFACE_TEXTURES[kind];
  const material = surfaceMat({
    color: tint,
    map: cloneTerritorySiegeTexture(textures.color, repeatX, repeatY),
    normalMap: cloneTerritorySiegeTexture(textures.normal, repeatX, repeatY),
    roughnessMap: cloneTerritorySiegeTexture(textures.roughness, repeatX, repeatY),
    roughness: 1,
    vertexColors,
  });
  const standard = material as THREE.MeshStandardMaterial;
  if (standard.isMeshStandardMaterial)
    standard.normalScale.setScalar(kind === 'grass' ? 0.72 : kind === 'snow' ? 0.46 : 0.55);
  surfaceMaterials.set(cacheKey, material);
  return material;
}

function buildTerrain(biome: TerritorySiegeBiome): THREE.Mesh {
  const style = FIELD_STYLES[biome];
  const visualHalfX = TERRITORY_SIEGE_FIELD_HALF_X + TERRITORY_SIEGE_VISUAL_MARGIN;
  const visualHalfZ = TERRITORY_SIEGE_FIELD_HALF_Z + TERRITORY_SIEGE_VISUAL_MARGIN;
  const geometry = new THREE.PlaneGeometry(visualHalfX * 2, visualHalfZ * 2, 112, 156);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  const baseColor = new THREE.Color(style.terrainBase);
  const soilColor = new THREE.Color(style.soil);
  const mountainColor = new THREE.Color(style.ridge);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = territorySiegeTerrainLiftLocal(x, z);
    positions.setY(index, height);
    const variation = Math.sin(x * 0.083 + z * 0.047) * 0.5 + Math.sin(z * 0.16 - x * 0.027) * 0.3;
    const soil = Math.max(0, Math.min(1, 0.42 + variation));
    color.copy(baseColor).lerp(soilColor, soil * (biome === 'rocky' ? 0.34 : 0.2));
    const mountain = Math.max(0, Math.min(0.86, (height - 2.2) / 15));
    color.lerp(mountainColor, mountain);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, texturedMaterial(style.surface, 0xffffff, 54, 74, true));
  mesh.name = `territory-siege-sculpted-ground:${biome}`;
  mesh.receiveShadow = true;
  return mesh;
}

function patchMaterial(biome: TerritorySiegeBiome): THREE.Material {
  const cached = patchMaterials.get(biome);
  if (cached) return cached;
  const style = FIELD_STYLES[biome];
  const material = texturedMaterial(style.patchSurface, style.patchTint, 1, 1, false);
  material.transparent = true;
  material.opacity = style.patchOpacity;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  patchMaterials.set(biome, material);
  return material;
}

/** Leaf-litter clearings break the uniform grass sheet without adding gameplay rings. */
function buildLeafLitterClearings(biome: TerritorySiegeBiome): THREE.Mesh {
  const placements = [
    { x: -46, z: 82, rx: 18, rz: 12, yaw: 0.35 },
    { x: 49, z: 67, rx: 16, rz: 10, yaw: -0.25 },
    { x: -63, z: 31, rx: 14, rz: 9, yaw: 0.8 },
    { x: 65, z: -11, rx: 15, rz: 10, yaw: 0.2 },
    { x: -67, z: -57, rx: 17, rz: 11, yaw: -0.5 },
    { x: 65, z: -91, rx: 14, rz: 9, yaw: 0.65 },
  ].filter(
    (patch) =>
      !territorySiegeSceneryIntersectsCastle(patch.x, patch.z, Math.max(patch.rx, patch.rz)),
  );
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 18;
  for (let patchIndex = 0; patchIndex < placements.length; patchIndex += 1) {
    const patch = placements[patchIndex];
    const base = positions.length / 3;
    positions.push(patch.x, territorySiegeTerrainLiftLocal(patch.x, patch.z) + 0.045, patch.z);
    uvs.push(patch.x * 0.12, patch.z * 0.12);
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const wobble = 0.82 + hash01(patch.x + index * 4.1, patch.z - index * 3.7) * 0.24;
      const px = Math.cos(angle) * patch.rx * wobble;
      const pz = Math.sin(angle) * patch.rz * wobble;
      const x = patch.x + px * Math.cos(patch.yaw) - pz * Math.sin(patch.yaw);
      const z = patch.z + px * Math.sin(patch.yaw) + pz * Math.cos(patch.yaw);
      positions.push(x, territorySiegeTerrainLiftLocal(x, z) + 0.045, z);
      uvs.push(x * 0.12, z * 0.12);
    }
    for (let index = 0; index < segments; index += 1)
      indices.push(base, base + 1 + index, base + 1 + ((index + 1) % segments));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, patchMaterial(biome));
  mesh.name = `territory-siege-surface-patches:${biome}`;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

function buildApproachRoad(biome: TerritorySiegeBiome): THREE.Mesh {
  const style = FIELD_STYLES[biome];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 30;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const z = 190 - t * 170;
    const center = Math.sin(t * Math.PI * 2.2) * 0.7 * Math.sin(t * Math.PI);
    const halfWidth = 7.2 + Math.sin(t * 13.1 + 0.4) * 0.65;
    for (const side of [-1, 1]) {
      const x = center + side * halfWidth;
      positions.push(x, territorySiegeTerrainLiftLocal(x, z) + 0.035, z);
      uvs.push(side < 0 ? 0 : 1, t * 14);
    }
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const road = new THREE.Mesh(
    geometry,
    texturedMaterial(style.roadSurface, style.roadTint, 2.2, 19, false),
  );
  road.name = `territory-siege-irregular-approach:${biome}`;
  road.receiveShadow = true;
  return road;
}

function hash01(x: number, z: number): number {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

const COURTYARD_SEAM_OVERLAP = 0.4;

function siegeGrassCardGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const yaw of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    const base = positions.length / 3;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    for (const [x, y, u, v] of [
      [-0.72, 0, 0, 0],
      [0.72, 0, 1, 0],
      [0.63, 0.96, 1, 1],
      [-0.63, 0.96, 0, 1],
    ] as const) {
      positions.push(x * cos, y, -x * sin);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function grassMaterial(biome: TerritorySiegeBiome): THREE.MeshStandardMaterial {
  if (biome === 'snow' && siegeSnowGrassMaterial) return siegeSnowGrassMaterial;
  if (biome !== 'snow' && siegeGrassMaterial) return siegeGrassMaterial;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grassTuftTexture(30),
    alphaTest: 0.3,
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  material.alphaToCoverage = true;
  if (biome === 'snow') {
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat territoryGrassSnow = smoothstep(0.38, 0.92, vMapUv.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.88, 0.94), territoryGrassSnow * 0.92);',
      );
    };
    material.customProgramCacheKey = () => `${previousCacheKey()}|territory-siege-snow-grass-v1`;
    material.needsUpdate = true;
    siegeSnowGrassMaterial = material;
  } else {
    siegeGrassMaterial = material;
  }
  return material;
}

/** Lush crossed billboard clumps, patch-gated so the field reads naturally. */
function buildBillboardGrass(biome: TerritorySiegeBiome): THREE.InstancedMesh {
  const placements = territorySiegeGrassPlacements(biome).filter(
    (grass) => !territorySiegeSceneryIntersectsCastle(grass.x, grass.z, grass.scale * 0.72),
  );
  const mesh = new THREE.InstancedMesh(
    siegeGrassCardGeometry(),
    grassMaterial(biome),
    placements.length,
  );
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  placements.forEach((grass, index) => {
    transform.position.set(grass.x, grass.y, grass.z);
    transform.rotation.set(0, grass.yaw, 0);
    transform.scale.set(grass.scale, grass.scale, grass.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, color.setHex(grass.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.name = `territory-siege-billboard-grass:${biome}:${placements.length}`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/** Low, clustered pebbles break up the soil without reading as repeated spikes. */
function buildGroundStoneScatter(biome: TerritorySiegeBiome): THREE.InstancedMesh {
  const style = FIELD_STYLES[biome];
  const placements: {
    x: number;
    z: number;
    scale: number;
    yaw: number;
    color: number;
  }[] = [];
  for (let patch = 0; patch < style.stonePatches; patch += 1) {
    const side = patch % 2 === 0 ? -1 : 1;
    const centerX = side * (28 + hash01(patch * 3.7, 2.1) * (TERRITORY_SIEGE_FIELD_HALF_X - 35));
    const centerZ =
      -TERRITORY_SIEGE_FIELD_HALF_Z +
      8 +
      hash01(patch * 7.3, 5.4) * (TERRITORY_SIEGE_FIELD_HALF_Z * 2 - 16);
    const count = 4 + (patch % 5);
    for (let index = 0; index < count; index += 1) {
      const angle = hash01(patch + index * 4.2, centerZ) * Math.PI * 2;
      const distance = 0.8 + hash01(centerX, index * 8.1) * 5.5;
      const x = centerX + Math.cos(angle) * distance;
      const z = centerZ + Math.sin(angle) * distance;
      if (Math.abs(x) > TERRITORY_SIEGE_FIELD_HALF_X - 3) continue;
      const scale = (0.32 + hash01(x, z) * 0.72) * style.stoneScale;
      if (territorySiegeSceneryIntersectsCastle(x, z, scale * 0.7)) continue;
      placements.push({
        x,
        z,
        scale,
        yaw: hash01(z, x) * Math.PI,
        color: hash01(x + 4, z - 9) > 0.45 ? style.stoneColors[0] : style.stoneColors[1],
      });
    }
  }
  const geometry = new THREE.DodecahedronGeometry(0.46, 0);
  const material = surfaceMat({ color: 0xffffff, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  placements.forEach((stone, index) => {
    transform.position.set(
      stone.x,
      territorySiegeTerrainLiftLocal(stone.x, stone.z) + 0.06,
      stone.z,
    );
    transform.rotation.set(0.1, stone.yaw, -0.08);
    transform.scale.set(stone.scale * 1.35, stone.scale * 0.38, stone.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, color.setHex(stone.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = `territory-siege-ground-stones:${biome}:${placements.length}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function placeAtHeight(
  parent: THREE.Object3D,
  key: TerritorySiegeAssetKey,
  x: number,
  y: number,
  z: number,
  height: number,
  yaw: number,
): THREE.Group {
  const asset = cloneTerritorySiegeAssetAtHeight(key, height);
  asset.position.set(x, y, z);
  asset.rotation.y = yaw;
  parent.add(asset);
  return asset;
}

function buildBiomeTrees(root: THREE.Object3D, biome: TerritorySiegeBiome): void {
  const snowPines: readonly TerritorySiegeAssetKey[] = ['snowPineA', 'snowPineB', 'snowPineC'];
  for (let index = 0; index < TERRITORY_SIEGE_TREES.length; index += 1) {
    const tree = TERRITORY_SIEGE_TREES[index];
    if (territorySiegeSceneryIntersectsCastle(tree.x, tree.z, tree.scale)) continue;
    const y = territorySiegeGroundLiftLocal(tree.x, tree.z);
    if (biome === 'desert') {
      placeAtHeight(root, 'desertTree', tree.x, y, tree.z, tree.scale * 0.92, tree.yaw);
      continue;
    }
    if (biome === 'snow') {
      // Frostveil keeps broad snow clearings between sparse hardy pines.
      if (index % 5 === 2 || index % 5 === 4) continue;
      placeAtHeight(
        root,
        snowPines[index % snowPines.length],
        tree.x,
        y,
        tree.z,
        tree.scale * 2.05,
        tree.yaw,
      );
      continue;
    }
    const key: TerritorySiegeAssetKey = index % 4 === 0 ? 'naturalOak' : 'naturalPine';
    place(root, key, tree.x, y, tree.z, tree.scale * (biome === 'rocky' ? 0.38 : 0.42), tree.yaw);
  }
}

function buildBiomeRocks(root: THREE.Object3D, biome: TerritorySiegeBiome): void {
  const snowRocks: readonly TerritorySiegeAssetKey[] = ['snowRockA', 'snowRockB', 'snowRockC'];
  for (let index = 0; index < TERRITORY_SIEGE_ROCKS.length; index += 1) {
    const rock = TERRITORY_SIEGE_ROCKS[index];
    if (territorySiegeSceneryIntersectsCastle(rock.x, rock.z, rock.scale)) continue;
    const y = territorySiegeGroundLiftLocal(rock.x, rock.z);
    if (biome === 'desert') {
      placeAtHeight(
        root,
        index % 2 === 0 ? 'desertBoulderA' : 'desertBoulderB',
        rock.x,
        y,
        rock.z,
        rock.scale * 0.62,
        rock.yaw,
      );
      continue;
    }
    if (biome === 'snow') {
      placeAtHeight(
        root,
        snowRocks[index % snowRocks.length],
        rock.x,
        y,
        rock.z,
        rock.scale * 0.82,
        rock.yaw,
      );
      continue;
    }
    place(
      root,
      'rock',
      rock.x,
      y,
      rock.z,
      rock.scale * (biome === 'rocky' ? 0.46 : 0.36),
      rock.yaw,
    );
  }
}

function buildBiomeUndergrowth(root: THREE.Object3D, biome: TerritorySiegeBiome): void {
  if (biome === 'snow') return;
  for (let index = 0; index < TERRITORY_SIEGE_BUSHES.length; index += 1) {
    const bush = TERRITORY_SIEGE_BUSHES[index];
    if (territorySiegeSceneryIntersectsCastle(bush.x, bush.z, bush.scale + 4.2)) continue;
    const y = territorySiegeGroundLiftLocal(bush.x, bush.z);
    if (biome === 'desert') {
      placeAtHeight(
        root,
        index % 3 === 0 ? 'desertCactusA' : 'desertCactusB',
        bush.x,
        y,
        bush.z,
        bush.scale * (index % 3 === 0 ? 1.42 : 0.9),
        bush.yaw,
      );
      continue;
    }
    if (biome === 'rocky' && index % 2 !== 0) continue;
    place(
      root,
      index % 3 === 0 ? 'bushFlowers' : 'bush',
      bush.x,
      y,
      bush.z,
      bush.scale * (biome === 'rocky' ? 0.38 : 0.55),
      bush.yaw,
    );
    if (biome === 'rocky') continue;
    for (const [offset, turn, scale] of [
      [3.1, 1.3, 1.7 + (index % 4) * 0.18],
      [2.25, -1.2, 1.35 + (index % 3) * 0.16],
      [4.1, 2.55, 1.15 + (index % 2) * 0.18],
    ] as const) {
      const fernX = bush.x + Math.cos(bush.yaw + turn) * offset;
      const fernZ = bush.z + Math.sin(bush.yaw + turn) * offset;
      place(
        root,
        'fern',
        fernX,
        territorySiegeGroundLiftLocal(fernX, fernZ),
        fernZ,
        scale,
        bush.yaw + turn + 0.7,
      );
    }
  }
}

/** Natural, textured ground plus biome-specific cover dressing for the battlefield. */
export function buildTerritorySiegeNaturalField(
  root: THREE.Object3D,
  biome: TerritorySiegeBiome,
): void {
  root.add(
    buildTerrain(biome),
    buildLeafLitterClearings(biome),
    buildApproachRoad(biome),
    buildBillboardGrass(biome),
    buildGroundStoneScatter(biome),
  );
  buildBiomeTrees(root, biome);
  buildBiomeRocks(root, biome);
  buildBiomeUndergrowth(root, biome);
}

export interface TerritorySiegeCastleSettlementView {
  setCastleLevel(level: number): void;
  setStructures(structures: readonly TerritoryStructureView[], castleLevel: number): void;
}

const RESOURCE_BUILDING_SLOTS = new Set<TerritoryStructureSlot>([
  'granary',
  'forester',
  'mine',
  'house',
]);

/** Existing art ladder used by the durable city-building visual projection. */
export function territorySiegeStructureAsset(
  slot: TerritoryStructureSlot,
  levelValue: number,
): TerritorySiegeAssetKey | null {
  if (!RESOURCE_BUILDING_SLOTS.has(slot)) return null;
  const level = Math.max(1, Math.min(4, Math.floor(levelValue)));
  if (level === 1) return 'frontierTent';
  if (level === 2) {
    if (slot === 'mine') return 'workshop';
    return slot === 'forester' ? 'homeB' : 'homeA';
  }
  if (slot === 'granary') return 'drakelandsTownhall';
  if (slot === 'forester') return 'drakelandsHomeA';
  if (slot === 'mine') return 'drakelandsBlacksmith';
  return 'drakelandsHomeB';
}

function resourceBuildingPlacement(
  slot: TerritoryStructureSlot,
  castleLevel: number,
): { x: number; y: number; z: number; scale: number; yaw: number } {
  return { ...territorySiegeResourceBuildingPlacement(slot, castleLevel), y: 0 };
}

function courtyardPlane(
  name: string,
  material: THREE.Material,
  tileStone: boolean,
  castleLevel: number,
): THREE.Mesh<THREE.PlaneGeometry, THREE.Material> {
  const bounds = territorySiegeCastleBounds(castleLevel);
  // Tuck each tier's floor just beneath its own inner wall skin. This keeps
  // levels one through three compact while the fourth-tier citadel alone uses
  // the expanded bailey footprint.
  const halfWidth =
    bounds.wallHalfX - TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH + COURTYARD_SEAM_OVERLAP;
  const frontZ = bounds.gateZ - TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH + COURTYARD_SEAM_OVERLAP;
  const backZ = bounds.backWallZ + TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH - COURTYARD_SEAM_OVERLAP;
  const width = halfWidth * 2;
  const depth = frontZ - backZ;
  const geometry = new THREE.PlaneGeometry(width, depth);
  if (tileStone) tileCastleUv(geometry, width, depth, FLAGSTONE_TILE_YD);
  geometry.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(geometry, material);
  floor.name = name;
  floor.position.set(0, 0.055, (frontZ + backZ) / 2);
  floor.receiveShadow = true;
  return floor;
}

/** Three prebuilt courtyard surfaces plus the shared lived-in keep dressing. */
export function buildTerritorySiegeCastleSettlement(
  root: THREE.Object3D,
): TerritorySiegeCastleSettlementView {
  const dirt = new THREE.Group();
  dirt.name = 'territory-siege-courtyard-tier:1:dirt';
  dirt.add(
    courtyardPlane(
      'territory-siege-courtyard-dirt',
      texturedMaterial('dirt', 0xaa865a, 18, 20, false),
      false,
      1,
    ),
  );
  place(dirt, 'frontierWatchtower', 0, 0, -63, 5.8, Math.PI);
  place(dirt, 'well', 16, 0, -25, 5.4, 0.2);
  place(dirt, 'hay', -17, 0, -19, 3.2, 0.5);
  place(dirt, 'hay', -20, 0, -22, 2.8, 1.8);
  root.add(dirt);

  const current = new THREE.Group();
  current.name = 'territory-siege-courtyard-tier:2:current';
  current.add(
    courtyardPlane(
      'territory-siege-courtyard-current-dirt',
      texturedMaterial('dirt', 0xaa865a, 18, 20, false),
      false,
      2,
    ),
  );
  root.add(current);
  let roadIndex = 0;
  for (let z = 13; z >= -65; z -= 7.2) {
    place(current, roadIndex++ % 2 === 0 ? 'roadA' : 'roadB', 0, 0, z, [4.2, 0.72, 4.2], 0);
  }
  for (let x = -34; x <= 34; x += 7.2) {
    place(
      current,
      roadIndex++ % 2 === 0 ? 'roadA' : 'roadB',
      x,
      0,
      -24,
      [4.2, 0.72, 4.2],
      Math.PI / 2,
    );
  }
  place(current, 'castle', 0, 0, -63, [5.3, 4.4, 5.3], Math.PI);
  place(current, 'well', 16, 0, -25, 7.2, 0.2);
  place(current, 'hay', -17, 0, -19, 3.2, 0.5);
  place(current, 'hay', -20, 0, -22, 2.8, 1.8);

  const drakelands = new THREE.Group();
  drakelands.name = 'territory-siege-courtyard-tier:3:drakelands';
  drakelands.add(
    courtyardPlane(
      'territory-siege-courtyard-drakelands-paving',
      castlePavingMat({ color: 0x77716b, roughness: 0.98 }),
      true,
      3,
    ),
  );
  // Premium Drakelands bailey: the same red-roofed civic and military
  // buildings used inside the Last Keep, kept on the established gameplay
  // footprints so castle-level changes never move collision under a player.
  place(drakelands, 'drakelandsCastle', 0, 0, -63, 4.6, Math.PI);
  place(drakelands, 'well', 16, 0, -25, 7.2, 0.2);
  root.add(drakelands);

  const citadel = new THREE.Group();
  citadel.name = 'territory-siege-courtyard-tier:4:citadel';
  citadel.add(
    courtyardPlane(
      'territory-siege-courtyard-citadel-paving',
      castlePavingMat({ color: 0x5f5b58, roughness: 0.96 }),
      true,
      4,
    ),
  );
  const citadelStone = surfaceMat({ color: 0x69635d, roughness: 0.98 });
  const innerWardWidth = TERRITORY_SIEGE_CITADEL_INNER_HALF_X * 2;
  const innerWardDepth =
    TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z - TERRITORY_SIEGE_CITADEL_INNER_BACK_Z;
  const innerWardCenterZ =
    (TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z + TERRITORY_SIEGE_CITADEL_INNER_BACK_Z) / 2;
  const innerWard = new THREE.Mesh(
    new THREE.BoxGeometry(innerWardWidth, TERRITORY_SIEGE_CITADEL_INNER_HEIGHT, innerWardDepth),
    citadelStone,
  );
  innerWard.name = 'territory-siege-citadel-inner-ward';
  innerWard.position.set(0, TERRITORY_SIEGE_CITADEL_INNER_HEIGHT / 2, innerWardCenterZ);
  innerWard.castShadow = true;
  innerWard.receiveShadow = true;
  citadel.add(innerWard);
  const innerWardTopGeometry = new THREE.PlaneGeometry(innerWardWidth, innerWardDepth);
  tileCastleUv(innerWardTopGeometry, innerWardWidth, innerWardDepth, FLAGSTONE_TILE_YD);
  innerWardTopGeometry.rotateX(-Math.PI / 2);
  const innerWardTop = new THREE.Mesh(
    innerWardTopGeometry,
    castlePavingMat({ color: 0x77716b, roughness: 0.98 }),
  );
  innerWardTop.name = 'territory-siege-citadel-inner-ward-paving';
  innerWardTop.position.set(0, TERRITORY_SIEGE_CITADEL_INNER_HEIGHT + 0.015, innerWardCenterZ);
  innerWardTop.receiveShadow = true;
  citadel.add(innerWardTop);

  // kcas_stairs_walled is authored as an exact 5 x 4 x 4 module. The compact
  // rear flight reaches the enlarged ward without consuming the rear bailey.
  const innerStairTreadHeight = 4;
  // The wide stair is 5.1 units tall (not four); scaling from its measured
  // source height makes its landing exactly flush with the wall walk.
  const wallStairTreadHeight = 5.1;
  const innerRamp = place(
    citadel,
    'drakelandsStairsWalled',
    0,
    0,
    TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
    [
      (TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH * 2) / 5,
      TERRITORY_SIEGE_CITADEL_INNER_HEIGHT / innerStairTreadHeight,
      Math.abs(
        TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z - TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
      ) / 4,
    ],
    Math.PI,
  );
  innerRamp.name = 'territory-siege-citadel-inner-stairs';

  const walkThickness = 0.34;
  for (const wallWalk of TERRITORY_SIEGE_CITADEL_WALL_WALKS) {
    const wallAccessWidth = wallWalk.halfX * 2;
    const wallAccessDepth = wallWalk.halfZ * 2;
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(wallAccessWidth, walkThickness, wallAccessDepth),
      citadelStone,
    );
    walk.name = `territory-siege-citadel-outer-wall-walk:${wallWalk.id}`;
    walk.position.set(
      wallWalk.x,
      TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT - walkThickness / 2,
      wallWalk.z,
    );
    walk.castShadow = true;
    walk.receiveShadow = true;
    citadel.add(walk);
    const walkTopGeometry = new THREE.PlaneGeometry(wallAccessWidth, wallAccessDepth);
    tileCastleUv(walkTopGeometry, wallAccessWidth, wallAccessDepth, FLAGSTONE_TILE_YD);
    walkTopGeometry.rotateX(-Math.PI / 2);
    const walkTop = new THREE.Mesh(
      walkTopGeometry,
      castlePavingMat({ color: 0x77716b, roughness: 0.98 }),
    );
    walkTop.name = `territory-siege-citadel-outer-wall-walk-paving:${wallWalk.id}`;
    walkTop.position.set(wallWalk.x, TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT + 0.012, wallWalk.z);
    walkTop.receiveShadow = true;
    citadel.add(walkTop);
  }

  const wallStairWidth = TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH * 2;
  for (const side of [-1, 1] as const) {
    const ramp = place(
      citadel,
      'drakelandsStairsWide',
      side * TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X,
      0,
      TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
      [
        wallStairWidth / 7,
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT / wallStairTreadHeight,
        (TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X - TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X) /
          4,
      ],
      side > 0 ? -Math.PI / 2 : Math.PI / 2,
    );
    ramp.name = `territory-siege-citadel-wall-stairs:${side < 0 ? 'left' : 'right'}`;
  }
  const innerY = TERRITORY_SIEGE_CITADEL_INNER_HEIGHT;
  // The core owns the central negative space. Civic buildings frame it while
  // the keep terminates the vista without intersecting the objective volume.
  place(citadel, 'drakelandsCastle', 0, innerY, -76, 5.1, 0);
  place(citadel, 'drakelandsBarracks', -24, innerY, -59, 5.35, 0.08);
  place(citadel, 'drakelandsTownhall', 24, innerY, -59, 5.35, -0.08);
  for (const home of TERRITORY_SIEGE_CITADEL_OUTER_HOMES) {
    place(
      citadel,
      home.kind === 'homeA' ? 'drakelandsHomeA' : 'drakelandsHomeB',
      home.x,
      0,
      home.z,
      home.scale,
      home.yaw,
    );
  }
  root.add(citadel);

  const structureRoot = new THREE.Group();
  structureRoot.name = 'territory-siege-durable-city-structures';
  root.add(structureRoot);
  let structureSignature = '';

  const setStructures = (
    structures: readonly TerritoryStructureView[],
    castleLevel: number,
  ): void => {
    const relevant = structures
      .filter((structure) => RESOURCE_BUILDING_SLOTS.has(structure.slot))
      .sort((a, b) => a.slot.localeCompare(b.slot));
    const signature = `${Math.floor(castleLevel)}:${relevant
      .map((structure) => `${structure.slot}:${structure.level}:${structure.state}`)
      .join('|')}`;
    if (signature === structureSignature) return;
    structureSignature = signature;
    structureRoot.clear();
    for (const structure of relevant) {
      const asset = territorySiegeStructureAsset(structure.slot, structure.level);
      if (!asset) continue;
      const placement = resourceBuildingPlacement(structure.slot, castleLevel);
      const model = place(
        structureRoot,
        asset,
        placement.x,
        placement.y,
        placement.z,
        placement.scale,
        placement.yaw,
      );
      model.name = `territory-siege-structure:${structure.slot}:level:${structure.level}:${structure.state}`;
      model.userData.territoryStructure = {
        slot: structure.slot,
        level: structure.level,
        state: structure.state,
      };
    }
  };

  const tiers = [dirt, current, drakelands, citadel] as const;
  const setCastleLevel = (level: number): void => showTerritoryCastleTier(tiers, level);
  setCastleLevel(2);
  return { setCastleLevel, setStructures };
}
