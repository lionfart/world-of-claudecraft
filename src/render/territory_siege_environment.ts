import * as THREE from 'three';
import {
  TERRITORY_SIEGE_BUSHES,
  TERRITORY_SIEGE_HOMES,
  TERRITORY_SIEGE_ROCKS,
  TERRITORY_SIEGE_TREES,
} from '../sim/territory_siege_environment';
import {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  territorySiegeGroundLiftLocal,
} from '../sim/territory_siege_ground';
import { surfaceMat } from './gfx';
import {
  cloneTerritorySiegeAsset,
  cloneTerritorySiegeTexture,
  type TerritorySiegeAssetKey,
} from './territory_siege_assets';

function place(
  parent: THREE.Object3D,
  key: TerritorySiegeAssetKey,
  x: number,
  y: number,
  z: number,
  scale: number,
  yaw: number,
): THREE.Group {
  const asset = cloneTerritorySiegeAsset(key);
  asset.position.set(x, y, z);
  asset.scale.setScalar(scale);
  asset.rotation.y = yaw;
  parent.add(asset);
  return asset;
}

let grassTerrainMaterial: THREE.Material | null = null;
let dirtRoadMaterial: THREE.Material | null = null;
let leafLitterMaterial: THREE.Material | null = null;

function texturedMaterial(kind: 'grass' | 'dirt'): THREE.Material {
  if (kind === 'grass' && grassTerrainMaterial) return grassTerrainMaterial;
  if (kind === 'dirt' && dirtRoadMaterial) return dirtRoadMaterial;
  const grass = kind === 'grass';
  const material = surfaceMat({
    color: grass ? 0xffffff : 0xa89172,
    map: cloneTerritorySiegeTexture(
      grass ? 'grassColor' : 'dirtColor',
      grass ? 32 : 2.2,
      grass ? 45 : 15,
    ),
    normalMap: cloneTerritorySiegeTexture(
      grass ? 'grassNormal' : 'dirtNormal',
      grass ? 32 : 2.2,
      grass ? 45 : 15,
    ),
    roughnessMap: cloneTerritorySiegeTexture(
      grass ? 'grassRoughness' : 'dirtRoughness',
      grass ? 32 : 2.2,
      grass ? 45 : 15,
    ),
    roughness: 1,
    vertexColors: grass,
  });
  const standard = material as THREE.MeshStandardMaterial;
  if (standard.isMeshStandardMaterial) standard.normalScale.setScalar(grass ? 0.72 : 0.55);
  if (grass) grassTerrainMaterial = material;
  else dirtRoadMaterial = material;
  return material;
}

function buildTerrain(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    TERRITORY_SIEGE_FIELD_HALF_X * 2,
    TERRITORY_SIEGE_FIELD_HALF_Z * 2,
    72,
    104,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  const soilColor = new THREE.Color(0xc2a778);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = territorySiegeGroundLiftLocal(x, z);
    positions.setY(index, height);
    const variation = Math.sin(x * 0.083 + z * 0.047) * 0.5 + Math.sin(z * 0.16 - x * 0.027) * 0.3;
    const soil = Math.max(0, Math.min(1, 0.42 + variation));
    color.setRGB(0.94, 0.98, 0.9).lerp(soilColor, soil * 0.2);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, texturedMaterial('grass'));
  mesh.name = 'territory-siege-sculpted-ground';
  mesh.receiveShadow = true;
  return mesh;
}

function leafMaterial(): THREE.Material {
  if (leafLitterMaterial) return leafLitterMaterial;
  const material = surfaceMat({
    color: 0xffffff,
    map: cloneTerritorySiegeTexture('dirtColor', 1, 1),
    normalMap: cloneTerritorySiegeTexture('dirtNormal', 1, 1),
    roughnessMap: cloneTerritorySiegeTexture('dirtRoughness', 1, 1),
    roughness: 1,
  });
  material.transparent = true;
  material.opacity = 0.72;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  const standard = material as THREE.MeshStandardMaterial;
  if (standard.isMeshStandardMaterial) standard.normalScale.setScalar(0.58);
  leafLitterMaterial = material;
  return material;
}

/** Leaf-litter clearings break the uniform grass sheet without adding gameplay rings. */
function buildLeafLitterClearings(): THREE.Mesh {
  const placements = [
    { x: -46, z: 82, rx: 18, rz: 12, yaw: 0.35 },
    { x: 49, z: 67, rx: 16, rz: 10, yaw: -0.25 },
    { x: -63, z: 31, rx: 14, rz: 9, yaw: 0.8 },
    { x: 65, z: -11, rx: 15, rz: 10, yaw: 0.2 },
    { x: -67, z: -57, rx: 17, rz: 11, yaw: -0.5 },
    { x: 65, z: -91, rx: 14, rz: 9, yaw: 0.65 },
  ] as const;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 18;
  for (let patchIndex = 0; patchIndex < placements.length; patchIndex += 1) {
    const patch = placements[patchIndex];
    const base = positions.length / 3;
    positions.push(patch.x, territorySiegeGroundLiftLocal(patch.x, patch.z) + 0.045, patch.z);
    uvs.push(patch.x * 0.12, patch.z * 0.12);
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const wobble = 0.82 + hash01(patch.x + index * 4.1, patch.z - index * 3.7) * 0.24;
      const px = Math.cos(angle) * patch.rx * wobble;
      const pz = Math.sin(angle) * patch.rz * wobble;
      const x = patch.x + px * Math.cos(patch.yaw) - pz * Math.sin(patch.yaw);
      const z = patch.z + px * Math.sin(patch.yaw) + pz * Math.cos(patch.yaw);
      positions.push(x, territorySiegeGroundLiftLocal(x, z) + 0.045, z);
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
  const mesh = new THREE.Mesh(geometry, leafMaterial());
  mesh.name = 'territory-siege-leaf-litter-clearings';
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

function buildApproachRoad(): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 30;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const z = 114 - t * 94;
    const center = Math.sin(t * Math.PI * 2.2) * 0.7 * Math.sin(t * Math.PI);
    const halfWidth = 7.2 + Math.sin(t * 13.1 + 0.4) * 0.65;
    for (const side of [-1, 1]) {
      const x = center + side * halfWidth;
      positions.push(x, territorySiegeGroundLiftLocal(x, z) + 0.035, z);
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
  const road = new THREE.Mesh(geometry, texturedMaterial('dirt'));
  road.name = 'territory-siege-irregular-approach';
  road.receiveShadow = true;
  return road;
}

function hash01(x: number, z: number): number {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

/** Dense crossed-blade ground cover in one draw call. */
function buildGrassCarpet(): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const tip = new THREE.Color();
  const root = new THREE.Color();
  let tuft = 0;
  for (
    let gz = -TERRITORY_SIEGE_FIELD_HALF_Z + 3;
    gz <= TERRITORY_SIEGE_FIELD_HALF_Z - 3;
    gz += 1.45
  ) {
    for (
      let gx = -TERRITORY_SIEGE_FIELD_HALF_X + 3;
      gx <= TERRITORY_SIEGE_FIELD_HALF_X - 3;
      gx += 1.5
    ) {
      const seed = hash01(gx, gz);
      if (seed < 0.28) continue;
      const x = gx + (hash01(gx + 13.4, gz) - 0.5) * 1.2;
      const z = gz + (hash01(gx, gz - 9.7) - 0.5) * 1.15;
      if (z > 14 && Math.abs(x) < 11.5) continue;
      const inCastle = z > -76 && z < 21 && Math.abs(x) < 47;
      if (inCastle && (Math.abs(x) < 5.5 || Math.abs(z + 24) < 5.5)) continue;
      const y = territorySiegeGroundLiftLocal(x, z) + 0.025;
      const height = 0.3 + hash01(x + 4.1, z + 7.8) * 0.5;
      const width = 0.09 + seed * 0.11;
      const yaw = seed * Math.PI;
      const flower = hash01(x - 17.3, z + 6.2) > 0.965;
      tip.set(flower ? 0xe4b34c : 0x668f42);
      root.set(0x263d24);
      const base = positions.length / 3;
      for (const turn of [yaw, yaw + Math.PI / 2]) {
        const dx = (Math.cos(turn) * width) / 2;
        const dz = (Math.sin(turn) * width) / 2;
        const leanX = Math.cos(yaw) * height * 0.16;
        const leanZ = Math.sin(yaw) * height * 0.16;
        positions.push(
          x - dx,
          y,
          z - dz,
          x + dx,
          y,
          z + dz,
          x + leanX + dx * 0.28,
          y + height,
          z + leanZ + dz * 0.28,
          x + leanX - dx * 0.28,
          y + height,
          z + leanZ - dz * 0.28,
        );
        colors.push(root.r, root.g, root.b, root.r, root.g, root.b);
        colors.push(tip.r, tip.g, tip.b, tip.r, tip.g, tip.b);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      indices.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
      tuft += 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = surfaceMat({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `territory-siege-grass:${tuft}`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/** Natural, textured ground plus foliage for the enlarged outer battlefield. */
export function buildTerritorySiegeNaturalField(root: THREE.Object3D): void {
  root.add(buildTerrain(), buildLeafLitterClearings(), buildApproachRoad(), buildGrassCarpet());

  for (let index = 0; index < TERRITORY_SIEGE_TREES.length; index += 1) {
    const tree = TERRITORY_SIEGE_TREES[index];
    const key: TerritorySiegeAssetKey = index % 4 === 0 ? 'naturalOak' : 'naturalPine';
    place(
      root,
      key,
      tree.x,
      territorySiegeGroundLiftLocal(tree.x, tree.z),
      tree.z,
      tree.scale * 0.42,
      tree.yaw,
    );
  }
  for (const rock of TERRITORY_SIEGE_ROCKS)
    place(
      root,
      'rock',
      rock.x,
      territorySiegeGroundLiftLocal(rock.x, rock.z),
      rock.z,
      rock.scale * 0.36,
      rock.yaw,
    );
  for (let index = 0; index < TERRITORY_SIEGE_BUSHES.length; index += 1) {
    const bush = TERRITORY_SIEGE_BUSHES[index];
    const y = territorySiegeGroundLiftLocal(bush.x, bush.z);
    place(
      root,
      index % 3 === 0 ? 'bushFlowers' : 'bush',
      bush.x,
      y,
      bush.z,
      bush.scale * 0.55,
      bush.yaw,
    );
    const fernX = bush.x + Math.cos(bush.yaw) * 3.1;
    const fernZ = bush.z + Math.sin(bush.yaw) * 3.1;
    place(
      root,
      'fern',
      fernX,
      territorySiegeGroundLiftLocal(fernX, fernZ),
      fernZ,
      1.7 + (index % 4) * 0.18,
      bush.yaw + 1.3,
    );
  }
}

/** Stone lanes, homes and small lived-in details inside the castle walls. */
export function buildTerritorySiegeCastleSettlement(root: THREE.Object3D): void {
  let roadIndex = 0;
  for (let z = 13; z >= -65; z -= 7.2) {
    place(root, roadIndex++ % 2 === 0 ? 'roadA' : 'roadB', 0, 0.025, z, 4.2, 0);
  }
  for (let x = -34; x <= 34; x += 7.2) {
    place(root, roadIndex++ % 2 === 0 ? 'roadA' : 'roadB', x, 0.023, -24, 4.2, Math.PI / 2);
  }

  for (const home of TERRITORY_SIEGE_HOMES)
    place(root, home.kind, home.x, 0, home.z, home.scale, home.yaw);

  place(root, 'well', 16, 0, -25, 7.2, 0.2);
  place(root, 'hay', -17, 0, -19, 3.2, 0.5);
  place(root, 'hay', -20, 0, -22, 2.8, 1.8);
  place(root, 'flag', -7, 0, 13, 5.2, 0);
  place(root, 'flag', 7, 0, 13, 5.2, 0);
}
