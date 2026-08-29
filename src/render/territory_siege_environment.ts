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
  TERRITORY_SIEGE_VISUAL_MARGIN,
  territorySiegeGroundLiftLocal,
  territorySiegeTerrainLiftLocal,
} from '../sim/territory_siege_ground';
import { surfaceMat } from './gfx';
import {
  cloneTerritorySiegeAsset,
  cloneTerritorySiegeTexture,
  type TerritorySiegeAssetKey,
} from './territory_siege_assets';
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

let grassTerrainMaterial: THREE.Material | null = null;
let dirtRoadMaterial: THREE.Material | null = null;
let leafLitterMaterial: THREE.Material | null = null;
let siegeGrassMaterial: THREE.MeshStandardMaterial | null = null;

function texturedMaterial(kind: 'grass' | 'dirt'): THREE.Material {
  if (kind === 'grass' && grassTerrainMaterial) return grassTerrainMaterial;
  if (kind === 'dirt' && dirtRoadMaterial) return dirtRoadMaterial;
  const grass = kind === 'grass';
  const material = surfaceMat({
    color: grass ? 0xffffff : 0xa89172,
    map: cloneTerritorySiegeTexture(
      grass ? 'grassColor' : 'dirtColor',
      grass ? 54 : 2.2,
      grass ? 74 : 19,
    ),
    normalMap: cloneTerritorySiegeTexture(
      grass ? 'grassNormal' : 'dirtNormal',
      grass ? 54 : 2.2,
      grass ? 74 : 19,
    ),
    roughnessMap: cloneTerritorySiegeTexture(
      grass ? 'grassRoughness' : 'dirtRoughness',
      grass ? 54 : 2.2,
      grass ? 74 : 19,
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
  const visualHalfX = TERRITORY_SIEGE_FIELD_HALF_X + TERRITORY_SIEGE_VISUAL_MARGIN;
  const visualHalfZ = TERRITORY_SIEGE_FIELD_HALF_Z + TERRITORY_SIEGE_VISUAL_MARGIN;
  const geometry = new THREE.PlaneGeometry(visualHalfX * 2, visualHalfZ * 2, 112, 156);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  const soilColor = new THREE.Color(0xc2a778);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = territorySiegeTerrainLiftLocal(x, z);
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
  const road = new THREE.Mesh(geometry, texturedMaterial('dirt'));
  road.name = 'territory-siege-irregular-approach';
  road.receiveShadow = true;
  return road;
}

function hash01(x: number, z: number): number {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

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

function grassMaterial(): THREE.MeshStandardMaterial {
  if (siegeGrassMaterial) return siegeGrassMaterial;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grassTuftTexture(30),
    alphaTest: 0.3,
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  material.alphaToCoverage = true;
  siegeGrassMaterial = material;
  return material;
}

/** Lush crossed billboard clumps, patch-gated so the field reads naturally. */
function buildBillboardGrass(): THREE.InstancedMesh {
  const placements: { x: number; z: number; scale: number; yaw: number; color: number }[] = [];
  const step = 2.7;
  for (
    let z = -TERRITORY_SIEGE_FIELD_HALF_Z + 4;
    z <= TERRITORY_SIEGE_FIELD_HALF_Z - 4;
    z += step
  ) {
    for (
      let x = -TERRITORY_SIEGE_FIELD_HALF_X + 4;
      x <= TERRITORY_SIEGE_FIELD_HALF_X - 4;
      x += step
    ) {
      const patch = hash01(Math.floor(x / 13) * 4.7, Math.floor(z / 13) * 7.1);
      if (patch < 0.37 || hash01(x + 5.3, z - 8.9) < 0.43) continue;
      const px = x + (hash01(x + 19.2, z) - 0.5) * 2.2;
      const pz = z + (hash01(x, z - 12.7) - 0.5) * 2.2;
      const edgeDistance = Math.min(
        TERRITORY_SIEGE_FIELD_HALF_X - Math.abs(px),
        TERRITORY_SIEGE_FIELD_HALF_Z - Math.abs(pz),
      );
      if (edgeDistance < 38) continue;
      const insideCastle = pz > -78 && pz < 23 && Math.abs(px) < 50;
      const onCastleLane = insideCastle && (Math.abs(px) < 6 || Math.abs(pz + 24) < 6);
      const onApproach = pz >= 16 && Math.abs(px) < 9.5;
      if (onCastleLane || onApproach) continue;
      placements.push({
        x: px,
        z: pz,
        scale: 0.72 + hash01(px - 3.1, pz + 11.4) * 0.68,
        yaw: hash01(pz + 2.7, px - 6.3) * Math.PI,
        color: patch > 0.76 ? 0x91aa62 : patch > 0.55 ? 0x6f934f : 0x587842,
      });
    }
  }
  const mesh = new THREE.InstancedMesh(
    siegeGrassCardGeometry(),
    grassMaterial(),
    placements.length,
  );
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  placements.forEach((grass, index) => {
    transform.position.set(
      grass.x,
      territorySiegeTerrainLiftLocal(grass.x, grass.z) + 0.015,
      grass.z,
    );
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
  mesh.name = `territory-siege-billboard-grass:${placements.length}`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

interface BoundaryPlacement {
  x: number;
  z: number;
  yaw: number;
  index: number;
}

/**
 * An overlapping mountain-and-cliff silhouette sits behind the authoritative
 * collision ring. The terrain continues beyond it, so no camera angle exposes
 * a floating rectangular arena edge.
 */
function buildMountainBoundary(root: THREE.Object3D): void {
  const placements: BoundaryPlacement[] = [];
  let index = 0;
  const boundaryX = TERRITORY_SIEGE_FIELD_HALF_X - 19;
  const boundaryZ = TERRITORY_SIEGE_FIELD_HALF_Z - 19;
  for (let x = -boundaryX; x <= boundaryX; x += 23.5) {
    const jitter = (hash01(x, 33.1) - 0.5) * 6;
    placements.push({ x, z: -boundaryZ + jitter, yaw: 0, index: index++ });
    placements.push({ x, z: boundaryZ - jitter, yaw: Math.PI, index: index++ });
  }
  for (let z = -boundaryZ + 18; z <= boundaryZ - 18; z += 23.5) {
    const jitter = (hash01(z, 71.4) - 0.5) * 6;
    placements.push({ x: -boundaryX + jitter, z, yaw: Math.PI / 2, index: index++ });
    placements.push({ x: boundaryX - jitter, z, yaw: -Math.PI / 2, index: index++ });
  }

  for (const boundary of placements) {
    const variation = hash01(boundary.x + 9.2, boundary.z - 4.7);
    const cliff = boundary.index % 5 === 0;
    const baseHeight = territorySiegeTerrainLiftLocal(boundary.x, boundary.z);
    place(
      root,
      cliff ? 'boundaryCliff' : 'boundaryRock',
      boundary.x,
      cliff ? baseHeight - 0.5 : baseHeight + 5.5,
      boundary.z,
      cliff
        ? [2.35 + variation * 0.45, 1.8 + variation * 0.45, 2.35 + variation * 0.45]
        : [3.9 + variation, 5.2 + variation * 1.35, 3.9 + variation],
      boundary.yaw + (variation - 0.5) * 0.55,
    );

    if (boundary.index % 3 === 1) {
      const treeX = boundary.x - Math.sin(boundary.yaw) * 7;
      const treeZ = boundary.z - Math.cos(boundary.yaw) * 7;
      place(
        root,
        'naturalPine',
        treeX,
        territorySiegeTerrainLiftLocal(treeX, treeZ),
        treeZ,
        3.2 + variation * 1.2,
        boundary.yaw + variation,
      );
    }
  }
}

/** Low, clustered pebbles break up the soil without reading as repeated spikes. */
function buildGroundStoneScatter(): THREE.InstancedMesh {
  const placements: { x: number; z: number; scale: number; yaw: number; color: number }[] = [];
  for (let patch = 0; patch < 42; patch += 1) {
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
      placements.push({
        x,
        z,
        scale: 0.32 + hash01(x, z) * 0.72,
        yaw: hash01(z, x) * Math.PI,
        color: hash01(x + 4, z - 9) > 0.45 ? 0x77766b : 0x5d6258,
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
  mesh.name = `territory-siege-ground-stones:${placements.length}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Natural, textured ground plus foliage for the enlarged outer battlefield. */
export function buildTerritorySiegeNaturalField(root: THREE.Object3D): void {
  root.add(
    buildTerrain(),
    buildLeafLitterClearings(),
    buildApproachRoad(),
    buildBillboardGrass(),
    buildGroundStoneScatter(),
  );
  buildMountainBoundary(root);

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

/** Stone lanes, homes and small lived-in details inside the castle walls. */
export function buildTerritorySiegeCastleSettlement(root: THREE.Object3D): void {
  let roadIndex = 0;
  for (let z = 13; z >= -65; z -= 7.2) {
    place(root, roadIndex++ % 2 === 0 ? 'roadA' : 'roadB', 0, 0, z, [4.2, 0.72, 4.2], 0);
  }
  for (let x = -34; x <= 34; x += 7.2) {
    place(
      root,
      roadIndex++ % 2 === 0 ? 'roadA' : 'roadB',
      x,
      0,
      -24,
      [4.2, 0.72, 4.2],
      Math.PI / 2,
    );
  }

  for (const home of TERRITORY_SIEGE_HOMES)
    place(root, home.kind, home.x, 0, home.z, home.scale, home.yaw);

  place(root, 'well', 16, 0, -25, 7.2, 0.2);
  place(root, 'hay', -17, 0, -19, 3.2, 0.5);
  place(root, 'hay', -20, 0, -22, 2.8, 1.8);
  place(root, 'flag', -7, 0, 13, 5.2, 0);
  place(root, 'flag', 7, 0, 13, 5.2, 0);
}
