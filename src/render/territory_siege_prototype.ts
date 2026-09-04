import * as THREE from 'three';
import { territorySiegeOrigin } from '../sim/data';
import { TERRITORY_SIEGE_ARTILLERY_TURN_RADIANS_PER_SECOND } from '../sim/territory_siege';
import type { TerritorySiegeBiome } from '../sim/territory_siege_biome';
import { territorySiegeGroundLiftLocal } from '../sim/territory_siege_ground';
import {
  TERRITORY_SIEGE_CORE_ATTACK_RADIUS,
  TERRITORY_SIEGE_CORE_Z,
  TERRITORY_SIEGE_DEFENDER_PORTAL_X,
  TERRITORY_SIEGE_DEFENDER_PORTAL_Z,
  TERRITORY_SIEGE_FLOOR_Y,
  TERRITORY_SIEGE_GATE_Z,
  TERRITORY_SIEGE_MAX_CATAPULTS_PER_SIDE,
  TERRITORY_SIEGE_MAX_RAMS,
  TERRITORY_SIEGE_TOWER_RANGE,
  TERRITORY_SIEGE_TOWER_X,
  TERRITORY_SIEGE_TOWER_Z,
  TERRITORY_SIEGE_WALL_SCALE_Z,
  TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
  territorySiegeWallPlacements,
  territorySiegeWallSegmentId,
} from '../sim/territory_siege_layout';
import type { TerritorySiegeObjectiveTarget, TerritorySiegeView } from '../world_api';
import { surfaceMat } from './gfx';
import {
  cloneTerritorySiegeAsset,
  cloneTerritorySiegeAssetAtHeight,
  type TerritorySiegeAssetKey,
} from './territory_siege_assets';
import {
  buildTerritorySiegeCastleSettlement,
  buildTerritorySiegeNaturalField,
} from './territory_siege_environment';
import {
  TERRITORY_SIEGE_CORE_CRYSTAL_SCALE,
  TERRITORY_SIEGE_GATE_VISUAL_HEIGHT,
  TERRITORY_SIEGE_GATE_VISUAL_WIDTH,
  TERRITORY_SIEGE_RAM_HEAD_BASE_Z,
  TERRITORY_SIEGE_RAM_SUPPORT_X,
  TERRITORY_SIEGE_RAM_SUPPORT_Z,
  territorySiegeVisualState,
} from './territory_siege_visual_core';

export interface TerritorySiegePrototypeView {
  group: THREE.Group;
  objectiveTargets: readonly THREE.Object3D[];
  update(
    siege: TerritorySiegeView | null,
    timeSeconds: number,
    player: { x: number; z: number },
    selectedObjective: TerritorySiegeObjectiveTarget | null,
  ): void;
}

function model(
  parent: THREE.Object3D,
  key: TerritorySiegeAssetKey,
  position: [number, number, number],
  scale: [number, number, number],
  yaw = 0,
): THREE.Group {
  const asset = cloneTerritorySiegeAsset(key);
  asset.position.set(...position);
  asset.scale.set(...scale);
  asset.rotation.y = yaw;
  parent.add(asset);
  return asset;
}

interface ArtilleryModel {
  root: THREE.Group;
  asset: THREE.Group;
  assetBaseZ: number;
  muzzleFlash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
}

/**
 * Imported siege props keep their authored transforms below a neutral yaw pivot.
 * Rotating this pivot makes traverse visible even when a GLB root has an exported
 * axis correction, while centering the mesh prevents it orbiting around its origin.
 */
function artilleryModel(
  parent: THREE.Object3D,
  key: 'mortar' | 'catapult',
  height: number,
): ArtilleryModel {
  const root = new THREE.Group();
  root.name = `territory-siege-${key}-yaw-pivot`;
  const asset = cloneTerritorySiegeAssetAtHeight(key, height);
  asset.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(asset);
  const center = bounds.getCenter(new THREE.Vector3());
  asset.position.set(-center.x, -bounds.min.y, -center.z);
  const assetBaseZ = asset.position.z;
  root.add(asset);
  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(key === 'mortar' ? 0.72 : 0.92, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffb13d,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      fog: false,
    }),
  );
  muzzleFlash.position.set(0, height * (key === 'mortar' ? 0.62 : 0.74), height * 0.48);
  muzzleFlash.renderOrder = 42;
  muzzleFlash.visible = false;
  root.add(muzzleFlash);
  parent.add(root);
  return { root, asset, assetBaseZ, muzzleFlash };
}

function turnTowardYaw(current: number, target: number, maxStep: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return Math.abs(delta) <= maxStep ? target : current + Math.sign(delta) * maxStep;
}

interface ObjectiveBeacon {
  root: THREE.Group;
  segments: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

function segmentedRingGeometry(
  innerRadius: number,
  outerRadius: number,
  segmentCount: number,
  fillFraction: number,
  subdivisions = 4,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const start = (segment / segmentCount) * Math.PI * 2;
    const length = (Math.PI * 2 * fillFraction) / segmentCount;
    const base = positions.length / 3;
    for (let step = 0; step <= subdivisions; step += 1) {
      const angle = start + (step / subdivisions) * length;
      for (const radius of [innerRadius, outerRadius])
        positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    }
    for (let step = 0; step < subdivisions; step += 1) {
      const cursor = base + step * 2;
      indices.push(cursor, cursor + 2, cursor + 1, cursor + 1, cursor + 2, cursor + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function objectiveBeacon(color: number, radius: number): ObjectiveBeacon {
  const root = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.93, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.014,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.035;
  root.add(fill);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.84, radius * 0.855, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.048;
  root.add(halo);
  const segments = new THREE.Mesh(
    segmentedRingGeometry(radius * 0.965, radius, 12, 0.56, 4),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  segments.position.y = 0.065;
  root.add(segments);
  return { root, segments, halo };
}

function towerRangeBeacon(centerX: number, centerZ: number, radius: number): THREE.Group {
  const group = new THREE.Group();
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 160;
  const thickness = 0.16;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    for (const ringRadius of [radius - thickness, radius]) {
      const x = centerX + Math.cos(angle) * ringRadius;
      const z = centerZ + Math.sin(angle) * ringRadius;
      positions.push(x, territorySiegeGroundLiftLocal(x, z) + 0.075, z);
    }
    const base = index * 2;
    const next = ((index + 1) % segments) * 2;
    if (index % 10 < 6) indices.push(base, next, base + 1, base + 1, next, next + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const ring = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xf6c77d,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.name = 'territory-siege-tower-range';
  ring.renderOrder = 3;
  group.add(ring);
  return group;
}

function buildRam(): { root: THREE.Group; head: THREE.Group } {
  const root = new THREE.Group();
  root.name = 'territory-siege-ram';
  model(root, 'cart', [0, 0, 0], [6.5, 4.4, 5.2], Math.PI);

  const head = new THREE.Group();
  head.position.set(0, 2.8, TERRITORY_SIEGE_RAM_HEAD_BASE_Z);
  root.add(head);
  model(head, 'log', [0, 0, -1.6], [1.2, 1.2, 5.4]);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 1.8, 10),
    surfaceMat({ color: 0x35383b, roughness: 0.5, metalness: 0.65 }),
  );
  cap.rotation.x = -Math.PI / 2;
  cap.position.z = -5.9;
  cap.castShadow = true;
  head.add(cap);

  for (const x of [-TERRITORY_SIEGE_RAM_SUPPORT_X, TERRITORY_SIEGE_RAM_SUPPORT_X]) {
    for (const z of [-TERRITORY_SIEGE_RAM_SUPPORT_Z, TERRITORY_SIEGE_RAM_SUPPORT_Z]) {
      const support = model(root, 'log', [x, 2.15, z], [0.52, 0.52, 2.8]);
      support.rotation.x = Math.PI / 2;
    }
  }
  return { root, head };
}

interface FittedGate {
  root: THREE.Group;
  leaf: THREE.Group;
}

interface StructureHealthPlate {
  sprite: THREE.Sprite;
  update(label: string, current: number, maximum: number, visible: boolean): void;
}

/** Camera-facing objective health, deliberately matching the compact NPC-bar language. */
function buildStructureHealthPlate(): StructureHealthPlate {
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 40;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable for siege objective health');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(7.4, 1.32, 1);
  sprite.renderOrder = 20;
  let signature = '';
  return {
    sprite,
    update(label, current, maximum, visible): void {
      sprite.visible = visible;
      if (!visible) return;
      const next = `${label}:${Math.ceil(current)}:${Math.ceil(maximum)}`;
      if (next === signature) return;
      signature = next;
      const ratio = maximum <= 0 ? 0 : Math.max(0, Math.min(1, current / maximum));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(7, 9, 10, 0.86)';
      context.fillRect(3, 3, 218, 34);
      context.strokeStyle = '#b58a36';
      context.lineWidth = 1.5;
      context.strokeRect(3, 3, 218, 34);
      context.fillStyle = '#e5d39b';
      context.font = 'bold 12px serif';
      context.textAlign = 'left';
      context.fillText(label, 10, 16);
      context.textAlign = 'right';
      context.fillText(`${Math.ceil(current)}/${Math.ceil(maximum)}`, 214, 16);
      context.fillStyle = '#24100d';
      context.fillRect(10, 23, 204, 6);
      context.fillStyle = ratio > 0.3 ? '#45b75c' : '#c84b32';
      context.fillRect(10, 23, 204 * ratio, 6);
      texture.needsUpdate = true;
    },
  };
}

/** Rectangular timber gate and stone frame sized to cover the full wall opening. */
function buildFittedGate(): FittedGate {
  const root = new THREE.Group();
  root.name = 'territory-siege-fitted-gate';
  const leaf = new THREE.Group();
  root.add(leaf);
  const wood = surfaceMat({ color: 0x56331f, roughness: 0.92 });
  const iron = surfaceMat({ color: 0x2d3135, roughness: 0.48, metalness: 0.72 });
  const stone = surfaceMat({ color: 0x7d8587, roughness: 0.94 });

  const slatCount = 12;
  const slatWidth = TERRITORY_SIEGE_GATE_VISUAL_WIDTH / slatCount;
  const slatGeometry = new THREE.BoxGeometry(
    slatWidth * 0.96,
    TERRITORY_SIEGE_GATE_VISUAL_HEIGHT,
    0.72,
  );
  const slats = new THREE.InstancedMesh(slatGeometry, wood, slatCount);
  const transform = new THREE.Object3D();
  for (let index = 0; index < slatCount; index += 1) {
    transform.position.set(
      -TERRITORY_SIEGE_GATE_VISUAL_WIDTH / 2 + slatWidth * (index + 0.5),
      TERRITORY_SIEGE_GATE_VISUAL_HEIGHT / 2,
      0,
    );
    transform.rotation.set(0, 0, 0);
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    slats.setMatrixAt(index, transform.matrix);
  }
  slats.instanceMatrix.needsUpdate = true;
  slats.castShadow = true;
  slats.receiveShadow = true;
  leaf.add(slats);

  for (const y of [1.25, 4.55]) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(TERRITORY_SIEGE_GATE_VISUAL_WIDTH + 0.25, 0.3, 0.92),
      iron,
    );
    band.position.set(0, y, 0.04);
    band.castShadow = true;
    leaf.add(band);
  }
  for (const side of [-1, 1]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.32, 0.94), iron);
    brace.position.set(side * 4.55, 2.9, 0.06);
    brace.rotation.z = side * 0.43;
    brace.castShadow = true;
    leaf.add(brace);
  }

  for (const x of [-10.55, 10.55]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.45, 6.65, 2.6), stone);
    jamb.position.set(x, 3.325, 0);
    jamb.castShadow = true;
    jamb.receiveShadow = true;
    root.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(22.55, 1.15, 2.75), stone);
  lintel.position.set(0, 6.25, 0);
  lintel.castShadow = true;
  lintel.receiveShadow = true;
  root.add(lintel);
  return { root, leaf };
}

interface CoreChannelFx {
  root: THREE.Group;
  update(
    visible: boolean,
    timeSeconds: number,
    pulse: number,
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): void;
}

function buildCoreChannelFx(): CoreChannelFx {
  const root = new THREE.Group();
  root.name = 'territory-siege-core-channel-fx';
  const outerMaterial = new THREE.MeshBasicMaterial({
    color: 0x36bff3,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerMaterial = new THREE.MeshBasicMaterial({
    color: 0xd7fbff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1, 10), outerMaterial);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.085, 1, 8), innerMaterial);
  root.add(outer, inner);

  const particleCount = 52;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleGeometry = new THREE.BufferGeometry();
  const particleAttribute = new THREE.BufferAttribute(particlePositions, 3);
  particleAttribute.setUsage(THREE.DynamicDrawUsage);
  particleGeometry.setAttribute('position', particleAttribute);
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.82 },
      uSize: { value: 0.36 },
    },
    vertexShader: `
      uniform float uSize;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uSize * (320.0 / max(1.0, -mvPosition.z));
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      void main() {
        float distanceToCenter = length(gl_PointCoord - vec2(0.5));
        float alpha = (1.0 - smoothstep(0.08, 0.5, distanceToCenter)) * uOpacity;
        gl_FragColor = vec4(0.48, 0.92, 1.0, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  root.add(particles);

  const flareMaterial = new THREE.MeshBasicMaterial({
    color: 0x9cefff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flare = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), flareMaterial);
  root.add(flare);
  root.visible = false;

  const direction = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const fallback = new THREE.Vector3(1, 0, 0);
  return {
    root,
    update(visible, timeSeconds, pulse, from, to): void {
      root.visible = visible;
      if (!visible) return;
      aimCylinder(outer, from, to);
      aimCylinder(inner, from, to);
      const thickness = 0.82 + pulse * 0.42;
      outer.scale.x = outer.scale.z = thickness;
      inner.scale.x = inner.scale.z = 0.88 + pulse * 0.18;
      outerMaterial.opacity = 0.13 + pulse * 0.2;
      innerMaterial.opacity = 0.7 + pulse * 0.28;

      direction.subVectors(to, from);
      const length = direction.length();
      direction.multiplyScalar(1 / Math.max(0.001, length));
      side.crossVectors(direction, up);
      if (side.lengthSq() < 0.001) side.copy(fallback);
      else side.normalize();
      lift.crossVectors(side, direction).normalize();
      for (let index = 0; index < particleCount; index += 1) {
        const flow = (index / particleCount + timeSeconds * 0.72) % 1;
        const angle = index * 2.399 + timeSeconds * 7.2;
        const radius = 0.12 + Math.sin(index * 1.77 + timeSeconds * 5.4) * 0.08;
        const offset = index * 3;
        particlePositions[offset] =
          from.x +
          direction.x * length * flow +
          side.x * Math.cos(angle) * radius +
          lift.x * Math.sin(angle) * radius;
        particlePositions[offset + 1] =
          from.y +
          direction.y * length * flow +
          side.y * Math.cos(angle) * radius +
          lift.y * Math.sin(angle) * radius;
        particlePositions[offset + 2] =
          from.z +
          direction.z * length * flow +
          side.z * Math.cos(angle) * radius +
          lift.z * Math.sin(angle) * radius;
      }
      particleAttribute.needsUpdate = true;
      particleMaterial.uniforms.uOpacity.value = 0.58 + pulse * 0.38;
      particleMaterial.uniforms.uSize.value = 0.28 + pulse * 0.18;
      flare.position.copy(to);
      flare.scale.setScalar(0.75 + pulse * 0.75);
      flareMaterial.opacity = 0.4 + pulse * 0.42;
    },
  };
}

const aimDirection = new THREE.Vector3();
const aimUp = new THREE.Vector3(0, 1, 0);

function aimCylinder(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  aimDirection.subVectors(to, from);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.scale.y = aimDirection.length();
  mesh.quaternion.setFromUnitVectors(aimUp, aimDirection.normalize());
}

const DEFENDER_PORTAL_FACE_CLEARANCE = 0.12;

export function buildTerritorySiegeDefenderPortal(): {
  root: THREE.Group;
  membrane: THREE.ShaderMaterial;
  innerRings: readonly THREE.Mesh[];
} {
  const root = new THREE.Group();
  root.name = 'territory-siege-defender-portal';
  root.position.set(TERRITORY_SIEGE_DEFENDER_PORTAL_X, 0, TERRITORY_SIEGE_DEFENDER_PORTAL_Z);
  const stone = surfaceMat({ color: 0x555249, roughness: 0.94 });
  const bronze = surfaceMat({ color: 0x73562d, roughness: 0.58, metalness: 0.5 });
  const membrane = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime;
      void main(){
        vec2 p=vUv-.5;
        float edge=smoothstep(.54,.28,length(vec2(p.x,p.y*.72)));
        float bands=sin((p.y+sin(p.x*9.0+uTime*1.7)*.06)*29.0-uTime*4.2)*.5+.5;
        float sparks=pow(max(0.0,sin(p.x*43.0+p.y*31.0+uTime*3.0)),18.0);
        vec3 color=mix(vec3(.03,.28,.08),vec3(.29,1.0,.43),bands*.58+sparks);
        gl_FragColor=vec4(color,edge*(.5+bands*.28));
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x6dff8c,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const innerRings: THREE.Mesh[] = [];
  const faceOffset = TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH + DEFENDER_PORTAL_FACE_CLEARANCE;
  for (const [side, z] of [
    ['inside', -faceOffset],
    ['outside', faceOffset],
  ] as const) {
    const face = new THREE.Group();
    face.name = `territory-siege-defender-portal-face:${side}`;
    face.position.z = z;
    for (const x of [-1.75, 1.75]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.7, 0.75), stone);
      pillar.position.set(x, 2.35, 0);
      pillar.castShadow = true;
      face.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.38, 0.92), bronze);
      cap.position.set(x, 4.58, 0);
      cap.castShadow = true;
      face.add(cap);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.34, 8, 30, Math.PI), stone);
    arch.position.y = 4.5;
    arch.rotation.z = Math.PI;
    arch.castShadow = true;
    face.add(arch);
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(3.25, 4.55), membrane);
    veil.name = 'territory-siege-defender-portal-veil';
    veil.position.y = 2.25;
    face.add(veil);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.07, 6, 28), ringMaterial);
    innerRing.name = 'territory-siege-defender-portal-ring';
    innerRing.position.y = 2.55;
    face.add(innerRing);
    innerRings.push(innerRing);
    root.add(face);
  }
  return { root, membrane, innerRings };
}

/** Asset-backed seasonal siege field using the existing optimized CC0 castle kit. */
export function buildTerritorySiegePrototype(
  slot: number,
  biome: TerritorySiegeBiome,
): TerritorySiegePrototypeView {
  const root = new THREE.Group();
  root.name = `territory-siege-field:${slot}:${biome}`;
  const origin = territorySiegeOrigin(slot);
  root.position.set(origin.x, TERRITORY_SIEGE_FLOOR_Y, origin.z);

  buildTerritorySiegeNaturalField(root, biome);

  buildTerritorySiegeCastleSettlement(root);

  const wallModels = territorySiegeWallPlacements().map((wall) => {
    const wallModel = model(
      root,
      'wall',
      [wall.x, 0, wall.z],
      [wall.scaleX, 4.55, TERRITORY_SIEGE_WALL_SCALE_Z],
      wall.yaw,
    );
    wallModel.userData.territorySiegeObjective = {
      kind: 'wall',
      id: territorySiegeWallSegmentId(wall),
    } satisfies TerritorySiegeObjectiveTarget;
    return { wall, model: wallModel };
  });

  const towerModels = [-TERRITORY_SIEGE_TOWER_X, TERRITORY_SIEGE_TOWER_X].map((x, index) => {
    const tower = model(root, 'tower', [x, 0, TERRITORY_SIEGE_TOWER_Z], [5.1, 4.4, 5.1]);
    tower.userData.territorySiegeObjective = {
      kind: 'tower',
      id: index === 0 ? 'left' : 'right',
    } satisfies TerritorySiegeObjectiveTarget;
    return tower;
  });

  const towerRanges = [-TERRITORY_SIEGE_TOWER_X, TERRITORY_SIEGE_TOWER_X].map((x) => {
    const range = towerRangeBeacon(x, TERRITORY_SIEGE_TOWER_Z, TERRITORY_SIEGE_TOWER_RANGE);
    root.add(range);
    return range;
  });

  const fittedGate = buildFittedGate();
  fittedGate.root.position.set(0, 0, TERRITORY_SIEGE_GATE_Z);
  fittedGate.root.userData.territorySiegeObjective = {
    kind: 'gate',
  } satisfies TerritorySiegeObjectiveTarget;
  root.add(fittedGate.root);
  const defenderPortal = buildTerritorySiegeDefenderPortal();
  root.add(defenderPortal.root);
  model(root, 'castle', [0, 0, -63], [5.3, 4.4, 5.3], Math.PI);
  model(root, 'workshop', [-35, 0, -52], [4.4, 4.4, 4.4], Math.PI / 5);

  const coreBeacon = objectiveBeacon(0x61d8e6, TERRITORY_SIEGE_CORE_ATTACK_RADIUS);
  const coreRoot = coreBeacon.root;
  coreRoot.position.set(0, 0, TERRITORY_SIEGE_CORE_Z);
  root.add(coreRoot);
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.8, 0.8, 12),
    surfaceMat({ color: 0x3e4651, roughness: 0.7, metalness: 0.35 }),
  );
  pedestal.position.y = 0.4;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  coreRoot.add(pedestal);
  model(coreRoot, 'coreAltar', [0, 0.72, 0], [4.1, 4.1, 4.1], Math.PI);
  const core = model(
    coreRoot,
    'coreCrystal',
    [0, 5.1, 0],
    [
      TERRITORY_SIEGE_CORE_CRYSTAL_SCALE,
      TERRITORY_SIEGE_CORE_CRYSTAL_SCALE,
      TERRITORY_SIEGE_CORE_CRYSTAL_SCALE,
    ],
  );
  core.rotation.z = Math.PI / 4;
  const coreHalo = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.12, 8, 36),
    new THREE.MeshBasicMaterial({
      color: 0x73d8ff,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  coreHalo.position.y = 5.1;
  coreHalo.rotation.x = Math.PI / 2;
  coreRoot.add(coreHalo);
  const coreHealth = buildStructureHealthPlate();
  coreHealth.sprite.position.set(0, 7.15, TERRITORY_SIEGE_CORE_Z);
  root.add(coreHealth.sprite);

  const coreChannelFx = Array.from({ length: 20 }, () => buildCoreChannelFx());
  for (const effect of coreChannelFx) root.add(effect.root);

  const ramParts = Array.from({ length: TERRITORY_SIEGE_MAX_RAMS }, () => buildRam());
  for (const ram of ramParts) root.add(ram.root);
  const ramBuildBeacon = objectiveBeacon(0xe3ad63, 8);
  ramBuildBeacon.root.position.set(0, 0, 27);
  root.add(ramBuildBeacon.root);

  const mortarModels = Array.from({ length: 6 }, () => {
    const mortar = artilleryModel(root, 'mortar', 3.25);
    mortar.root.visible = false;
    return mortar;
  });

  const catapultModels = Array.from({ length: TERRITORY_SIEGE_MAX_CATAPULTS_PER_SIDE * 2 }, () => {
    const catapult = artilleryModel(root, 'catapult', 5.8);
    catapult.root.visible = false;
    return catapult;
  });
  const selection = objectiveBeacon(0xd7ae47, 1);
  selection.root.name = 'territory-siege-objective-selection';
  selection.root.visible = false;
  root.add(selection.root);
  const catapultProjectiles = Array.from({ length: 12 }, () => {
    const flight = new THREE.Group();
    const rocks = Array.from({ length: 5 }, (_, index) => {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(index === 0 ? 1.35 : 0.62, 0),
        surfaceMat({ color: index === 0 ? 0x403a34 : 0x514940, roughness: 0.96 }),
      );
      rock.castShadow = true;
      flight.add(rock);
      return rock;
    });
    flight.visible = false;
    root.add(flight);
    return { flight, rocks };
  });
  const catapultFlightClocks = new Map<
    number,
    { seenAt: number; remaining: number; launchRemaining: number }
  >();
  const activeCatapultShots = new Set<number>();
  const mortarProjectiles = Array.from({ length: 12 }, () => {
    const flight = new THREE.Group();
    const shells = (
      [
        ['normal', 0xed782b, 0.62],
        ['frost', 0x2cbbff, 0.92],
        ['venom', 0x53df31, 0.82],
      ] as const
    ).map(([kind, emissive, emissiveIntensity]) => {
      const shell = new THREE.Group();
      const iron = surfaceMat({
        color: 0x292b2c,
        roughness: 0.5,
        metalness: 0.72,
      });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.31, 1.35, 14), iron);
      body.castShadow = true;
      shell.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.72, 14), iron);
      nose.position.y = 1.03;
      nose.castShadow = true;
      shell.add(nose);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.385, 0.385, 0.18, 14),
        surfaceMat({
          color: emissive,
          roughness: 0.45,
          metalness: 0.52,
          emissive,
          emissiveIntensity,
        }),
      );
      band.position.y = 0.22;
      shell.add(band);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.46, 12), iron);
      tail.position.y = -0.9;
      shell.add(tail);
      for (let fin = 0; fin < 4; fin += 1) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.55), iron);
        blade.position.y = -1.02;
        blade.rotation.y = (fin * Math.PI) / 2;
        shell.add(blade);
      }
      shell.scale.setScalar(1.18);
      shell.visible = false;
      flight.add(shell);
      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 10, 8),
        new THREE.MeshBasicMaterial({
          color: emissive,
          transparent: true,
          opacity: 0.24,
          depthTest: false,
          depthWrite: false,
          fog: false,
        }),
      );
      aura.renderOrder = 40;
      aura.visible = false;
      flight.add(aura);
      const trail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.34, 3.1, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: kind === 'normal' ? 0x807a70 : emissive,
          transparent: true,
          opacity: kind === 'normal' ? 0.34 : 0.42,
          depthTest: false,
          depthWrite: false,
          fog: false,
          side: THREE.DoubleSide,
        }),
      );
      trail.renderOrder = 39;
      trail.visible = false;
      flight.add(trail);
      return { kind, shell, aura, trail };
    });
    flight.visible = false;
    root.add(flight);
    return { flight, shells };
  });
  const mortarFlightClocks = new Map<
    number,
    { seenAt: number; remaining: number; launchRemaining: number }
  >();
  const activeMortarShots = new Set<number>();
  const mortarVisualYaws = new Map<number, number>();
  const catapultVisualYaws = new Map<number, number>();
  const mortarShotIds = new Map<number, number>();
  const catapultShotIds = new Map<number, number>();
  const mortarRecoilStartedAt = new Map<number, number>();
  const catapultRecoilStartedAt = new Map<number, number>();
  const projectileTangent = new THREE.Vector3();
  let artilleryVisualWarId: string | null = null;
  let lastArtilleryVisualAt = 0;
  const structureHealth = {
    towers: (['left', 'right'] as const).map((id, index) => {
      const plate = buildStructureHealthPlate();
      plate.sprite.position.set(
        index === 0 ? -TERRITORY_SIEGE_TOWER_X : TERRITORY_SIEGE_TOWER_X,
        7.6,
        TERRITORY_SIEGE_TOWER_Z,
      );
      root.add(plate.sprite);
      return { id, plate };
    }),
  };

  const towerProjectiles = Array.from({ length: 8 }, () => {
    const flight = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.72, 1),
      surfaceMat({
        color: 0xffb03b,
        roughness: 0.38,
        emissive: 0xff5b16,
        emissiveIntensity: 1.15,
        rim: true,
      }),
    );
    core.castShadow = true;
    flight.add(core);
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff7a24,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    flight.add(aura);
    flight.visible = false;
    root.add(flight);
    return { flight, core, aura };
  });
  const towerFlightClocks = new Map<number, { seenAt: number; remaining: number }>();
  const activeTowerShots = new Set<number>();
  const channelFrom = new THREE.Vector3();
  const channelTo = new THREE.Vector3(0, 5.1, TERRITORY_SIEGE_CORE_Z);

  const update = (
    siege: TerritorySiegeView | null,
    timeSeconds: number,
    player: { x: number; z: number },
    selectedObjective: TerritorySiegeObjectiveTarget | null,
  ): void => {
    const nextWarId = siege?.warId ?? null;
    if (artilleryVisualWarId !== nextWarId) {
      artilleryVisualWarId = nextWarId;
      mortarVisualYaws.clear();
      catapultVisualYaws.clear();
      mortarShotIds.clear();
      catapultShotIds.clear();
      mortarRecoilStartedAt.clear();
      catapultRecoilStartedAt.clear();
      lastArtilleryVisualAt = timeSeconds;
    }
    const artilleryDeltaSeconds = Math.max(0, Math.min(0.1, timeSeconds - lastArtilleryVisualAt));
    lastArtilleryVisualAt = timeSeconds;
    const artilleryTurnStep =
      TERRITORY_SIEGE_ARTILLERY_TURN_RADIANS_PER_SECOND * artilleryDeltaSeconds;
    // A replicated flight only exists after the server-authoritative traverse is
    // complete. Lock the visible pivot to that exact launch bearing before the
    // projectile/recoil begins, eliminating network-frame ordering artifacts.
    for (const shot of siege?.mortarZones ?? []) {
      const lastShotId = mortarShotIds.get(shot.mortarId) ?? 0;
      if (shot.id <= lastShotId) continue;
      mortarShotIds.set(shot.mortarId, shot.id);
      mortarVisualYaws.set(shot.mortarId, Math.atan2(shot.x - shot.fromX, shot.z - shot.fromZ));
      mortarRecoilStartedAt.set(shot.mortarId, timeSeconds);
    }
    for (const shot of siege?.catapultShots ?? []) {
      const lastShotId = catapultShotIds.get(shot.catapultId) ?? 0;
      if (shot.id <= lastShotId) continue;
      catapultShotIds.set(shot.catapultId, shot.id);
      catapultVisualYaws.set(shot.catapultId, Math.atan2(shot.x - shot.fromX, shot.z - shot.fromZ));
      catapultRecoilStartedAt.set(shot.catapultId, timeSeconds);
    }
    const state = territorySiegeVisualState(siege, timeSeconds);
    fittedGate.leaf.visible = state.gateVisible;
    fittedGate.leaf.scale.y = state.gateScaleY;
    core.scale.setScalar(TERRITORY_SIEGE_CORE_CRYSTAL_SCALE * state.coreScaleY);
    coreRoot.visible = siege !== null;
    const towersActive = !!siege && siege.defenseTowerLevel > 0;
    for (const tower of towerModels) tower.visible = towersActive;
    for (const entry of wallModels) {
      const objectiveId = territorySiegeWallSegmentId(entry.wall);
      const health = siege?.wallHealth?.find((value) => value.id === objectiveId);
      entry.model.visible = !health || health.hp > 0;
    }
    for (let index = 0; index < towerModels.length; index += 1) {
      const id = index === 0 ? 'left' : 'right';
      const health = siege?.towerHealth?.find((value) => value.id === id);
      towerModels[index].visible = towersActive && (!health || health.hp > 0);
    }
    for (const range of towerRanges) range.visible = towersActive && siege.state === 'active';
    const deployedRams = siege?.rams?.length
      ? siege.rams
      : siege?.ramDeployed
        ? [
            {
              id: 0,
              x: 0,
              z: 23,
              yaw: 0,
              occupied: siege.ramJoined,
              cooldown: siege.ramCooldown,
              empoweredCooldown: siege.ramEmpoweredCooldown,
              hp: 1,
              maxHp: 1,
            },
          ]
        : [];
    for (let index = 0; index < ramParts.length; index += 1) {
      const parts = ramParts[index];
      const deployed = deployedRams[index];
      parts.root.visible = !!deployed;
      if (!deployed) continue;
      parts.root.position.set(deployed.x, 0, deployed.z);
      parts.root.rotation.y = deployed.yaw;
      parts.root.userData.territorySiegeObjective = {
        kind: 'ram',
        id: deployed.id,
      } satisfies TerritorySiegeObjectiveTarget;
      parts.head.position.z =
        TERRITORY_SIEGE_RAM_HEAD_BASE_Z -
        (deployed.cooldown > 0 ? Math.sin(timeSeconds * 8 + index * 0.35) * 0.72 : 0);
    }
    for (let index = 0; index < mortarModels.length; index += 1) {
      const view = siege?.mortars[index];
      const mortar = mortarModels[index];
      mortar.root.visible = !!view;
      if (!view) continue;
      mortar.root.position.set(view.x, 0, view.z);
      const visualYaw = turnTowardYaw(
        mortarVisualYaws.get(view.id) ?? view.yaw,
        view.targetYaw ?? view.yaw,
        artilleryTurnStep,
      );
      mortarVisualYaws.set(view.id, visualYaw);
      mortar.root.rotation.y = visualYaw;
      const recoilAge = timeSeconds - (mortarRecoilStartedAt.get(view.id) ?? -100);
      const recoil =
        recoilAge >= 0 && recoilAge <= 0.42 ? Math.sin((recoilAge / 0.42) * Math.PI) : 0;
      mortar.asset.position.z = mortar.assetBaseZ - recoil * 0.42;
      mortar.muzzleFlash.visible = recoilAge >= 0 && recoilAge <= 0.2;
      if (mortar.muzzleFlash.visible) {
        const flashPulse = 1 + Math.sin((recoilAge / 0.2) * Math.PI) * 1.8;
        mortar.muzzleFlash.scale.setScalar(flashPulse);
        mortar.muzzleFlash.material.opacity = 0.72 * (1 - recoilAge / 0.2);
      }
      mortar.root.userData.territorySiegeObjective = {
        kind: 'mortar',
        id: view.id,
      } satisfies TerritorySiegeObjectiveTarget;
    }
    for (let index = 0; index < catapultModels.length; index += 1) {
      const view = siege?.catapults?.[index];
      const catapult = catapultModels[index];
      catapult.root.visible = !!view;
      if (!view) continue;
      const recoilAge = timeSeconds - (catapultRecoilStartedAt.get(view.id) ?? -100);
      const recoil =
        recoilAge >= 0 && recoilAge <= 0.72 ? Math.sin((recoilAge / 0.72) * Math.PI) : 0;
      catapult.root.position.set(view.x, recoil * 0.18, view.z);
      const visualYaw = turnTowardYaw(
        catapultVisualYaws.get(view.id) ?? view.yaw,
        view.targetYaw ?? view.yaw,
        artilleryTurnStep,
      );
      catapultVisualYaws.set(view.id, visualYaw);
      catapult.root.rotation.y = visualYaw;
      catapult.root.rotation.x = recoil * -0.045;
      catapult.muzzleFlash.visible = recoilAge >= 0 && recoilAge <= 0.2;
      if (catapult.muzzleFlash.visible) {
        catapult.muzzleFlash.scale.setScalar(1 + Math.sin((recoilAge / 0.2) * Math.PI) * 1.5);
        catapult.muzzleFlash.material.opacity = 0.58 * (1 - recoilAge / 0.2);
      }
      catapult.root.userData.territorySiegeObjective = {
        kind: 'catapult',
        id: view.id,
      } satisfies TerritorySiegeObjectiveTarget;
    }
    activeCatapultShots.clear();
    for (let index = 0; index < catapultProjectiles.length; index += 1) {
      const view = siege?.catapultShots?.[index];
      const projectile = catapultProjectiles[index];
      projectile.flight.visible = false;
      if (!view) continue;
      activeCatapultShots.add(view.id);
      const clock = catapultFlightClocks.get(view.id) ?? {
        seenAt: timeSeconds,
        remaining: view.detonatesIn,
        launchRemaining: view.launchesIn,
      };
      if (!catapultFlightClocks.has(view.id)) catapultFlightClocks.set(view.id, clock);
      const locallyRemaining = Math.max(0, clock.remaining - (timeSeconds - clock.seenAt));
      const remaining = Math.min(view.detonatesIn, locallyRemaining);
      const locallyLaunchRemaining = Math.max(
        0,
        clock.launchRemaining - (timeSeconds - clock.seenAt),
      );
      if (Math.min(view.launchesIn, locallyLaunchRemaining) > 0) continue;
      projectile.flight.visible = true;
      const progress = Math.max(0, Math.min(1, 1 - remaining / Math.max(0.001, view.duration)));
      const localX = THREE.MathUtils.lerp(view.fromX - origin.x, view.x - origin.x, progress);
      const localZ = THREE.MathUtils.lerp(view.fromZ - origin.z, view.z - origin.z, progress);
      projectile.flight.position.set(localX, 2.6 + Math.sin(progress * Math.PI) * 21, localZ);
      projectile.flight.rotation.set(timeSeconds * 2.3, timeSeconds * 1.7, timeSeconds * 1.2);
      for (let rockIndex = 0; rockIndex < projectile.rocks.length; rockIndex += 1) {
        const rock = projectile.rocks[rockIndex];
        rock.visible = view.kind === 'cluster' || rockIndex === 0;
        const spread = view.kind === 'cluster' ? 1.55 : 0;
        rock.position.set(
          Math.cos(rockIndex * 2.4) * spread,
          Math.sin(rockIndex * 1.9) * spread * 0.6,
          Math.sin(rockIndex * 2.4) * spread,
        );
      }
    }
    for (const id of catapultFlightClocks.keys()) {
      if (!activeCatapultShots.has(id)) catapultFlightClocks.delete(id);
    }
    activeMortarShots.clear();
    for (let index = 0; index < mortarProjectiles.length; index += 1) {
      const view = siege?.mortarZones[index];
      const projectile = mortarProjectiles[index];
      projectile.flight.visible = false;
      if (!view) continue;
      activeMortarShots.add(view.id);
      const clock = mortarFlightClocks.get(view.id) ?? {
        seenAt: timeSeconds,
        remaining: view.detonatesIn,
        launchRemaining: view.launchesIn,
      };
      if (!mortarFlightClocks.has(view.id)) mortarFlightClocks.set(view.id, clock);
      const locallyRemaining = Math.max(0, clock.remaining - (timeSeconds - clock.seenAt));
      const remaining = Math.min(view.detonatesIn, locallyRemaining);
      const locallyLaunchRemaining = Math.max(
        0,
        clock.launchRemaining - (timeSeconds - clock.seenAt),
      );
      if (Math.min(view.launchesIn, locallyLaunchRemaining) > 0) continue;
      projectile.flight.visible = true;
      const progress = Math.max(0, Math.min(1, 1 - remaining / Math.max(0.001, view.duration)));
      const localX = THREE.MathUtils.lerp(view.fromX - origin.x, view.x - origin.x, progress);
      const localZ = THREE.MathUtils.lerp(view.fromZ - origin.z, view.z - origin.z, progress);
      projectile.flight.position.set(localX, 2.6 + Math.sin(progress * Math.PI) * 15, localZ);
      projectile.flight.rotation.set(0, 0, 0);
      projectileTangent
        .set(view.x - view.fromX, Math.PI * 15 * Math.cos(progress * Math.PI), view.z - view.fromZ)
        .normalize();
      for (const shell of projectile.shells) {
        const visible = shell.kind === view.kind;
        shell.shell.visible = visible;
        shell.aura.visible = visible;
        shell.trail.visible = visible;
        if (!visible) continue;
        shell.shell.quaternion.setFromUnitVectors(aimUp, projectileTangent);
        shell.aura.position.copy(projectileTangent).multiplyScalar(-1.25);
        shell.aura.scale.setScalar(0.9 + Math.sin(timeSeconds * 12) * 0.08);
        shell.trail.position.copy(projectileTangent).multiplyScalar(-1.8);
        shell.trail.quaternion.setFromUnitVectors(aimUp, projectileTangent);
      }
    }
    for (const id of mortarFlightClocks.keys()) {
      if (!activeMortarShots.has(id)) mortarFlightClocks.delete(id);
    }
    for (const { id, plate } of structureHealth.towers) {
      const health = siege?.towerHealth?.find((entry) => entry.id === id);
      plate.update(
        'Defense Tower',
        health?.hp ?? 0,
        health?.maxHp ?? 1,
        !!health && health.hp > 0 && health.hp < health.maxHp,
      );
    }
    let selectionPose:
      | { x: number; z: number; yaw: number; scaleX: number; scaleZ: number }
      | undefined;
    if (siege && selectedObjective) {
      if (selectedObjective.kind === 'gate' && !siege.gateOpen) {
        selectionPose = { x: 0, z: TERRITORY_SIEGE_GATE_Z, yaw: 0, scaleX: 10.8, scaleZ: 2.35 };
      } else if (selectedObjective.kind === 'wall') {
        const entry = wallModels.find(
          ({ wall }) => territorySiegeWallSegmentId(wall) === selectedObjective.id,
        );
        const health = siege.wallHealth?.find((value) => value.id === selectedObjective.id);
        if (entry?.model.visible && (!health || health.hp > 0)) {
          selectionPose = {
            x: entry.wall.x,
            z: entry.wall.z,
            yaw: entry.wall.yaw,
            scaleX: entry.wall.scaleX + 0.8,
            scaleZ: 2.05,
          };
        }
      } else if (selectedObjective.kind === 'tower') {
        const index = selectedObjective.id === 'left' ? 0 : 1;
        if (towerModels[index]?.visible) {
          selectionPose = {
            x: index === 0 ? -TERRITORY_SIEGE_TOWER_X : TERRITORY_SIEGE_TOWER_X,
            z: TERRITORY_SIEGE_TOWER_Z,
            yaw: 0,
            scaleX: 4.8,
            scaleZ: 4.8,
          };
        }
      } else if (
        selectedObjective.kind === 'ram' ||
        selectedObjective.kind === 'mortar' ||
        selectedObjective.kind === 'catapult'
      ) {
        const collection =
          selectedObjective.kind === 'ram'
            ? deployedRams
            : selectedObjective.kind === 'mortar'
              ? siege.mortars
              : (siege.catapults ?? []);
        const weapon = collection.find((value) => value.id === selectedObjective.id);
        if (weapon) {
          const radius =
            selectedObjective.kind === 'ram'
              ? 3.15
              : selectedObjective.kind === 'mortar'
                ? 2.85
                : 3.55;
          selectionPose = {
            x: weapon.x,
            z: weapon.z,
            yaw: weapon.yaw,
            scaleX: radius,
            scaleZ: radius,
          };
        }
      }
    }
    selection.root.visible = !!selectionPose;
    if (selectionPose) {
      selection.root.position.set(
        selectionPose.x,
        territorySiegeGroundLiftLocal(selectionPose.x, selectionPose.z) + 0.055,
        selectionPose.z,
      );
      selection.root.rotation.y = selectionPose.yaw;
      selection.root.scale.set(selectionPose.scaleX, 1, selectionPose.scaleZ);
      selection.segments.rotation.y = timeSeconds * 0.7;
      const pulse = 0.5 + Math.sin(timeSeconds * 4.5) * 0.5;
      selection.segments.material.opacity = 0.7 + pulse * 0.22;
      selection.halo.material.opacity = 0.16 + pulse * 0.1;
    }
    ramBuildBeacon.root.visible =
      !!siege && deployedRams.length < TERRITORY_SIEGE_MAX_RAMS && !siege.gateOpen;
    const objectivePulse = 0.5 + Math.sin(timeSeconds * 1.65) * 0.5;
    coreBeacon.segments.rotation.y = timeSeconds * 0.035;
    coreBeacon.segments.material.opacity = 0.14 + objectivePulse * 0.08;
    coreBeacon.halo.material.opacity = 0.05 + objectivePulse * 0.035;
    ramBuildBeacon.segments.rotation.y = -timeSeconds * 0.045;
    ramBuildBeacon.segments.material.opacity = 0.14 + objectivePulse * 0.07;
    ramBuildBeacon.halo.material.opacity = 0.045 + objectivePulse * 0.03;
    coreHealth.update(
      'Keep Core',
      siege?.coreHp ?? Math.max(0, 1 - (siege?.coreProgress ?? 0)) * 100,
      siege?.coreMaxHp ?? 100,
      state.coreHealthVisible,
    );
    coreHalo.rotation.z = timeSeconds * 0.55;
    coreHalo.scale.setScalar(0.92 + state.coreChannelPulse * 0.16);
    defenderPortal.root.visible = !!siege;
    defenderPortal.membrane.uniforms.uTime.value = timeSeconds;
    for (const innerRing of defenderPortal.innerRings) innerRing.rotation.z = timeSeconds * 0.65;
    const sharedChannels = siege?.coreChannels ?? [];
    const channelSources = sharedChannels.length
      ? sharedChannels
      : state.coreChannelVisible
        ? [player]
        : [];
    for (let index = 0; index < coreChannelFx.length; index += 1) {
      const source = channelSources[index];
      if (source) channelFrom.set(source.x - origin.x, 1.6, source.z - origin.z);
      coreChannelFx[index].update(
        !!source,
        timeSeconds + index * 0.11,
        state.coreChannelPulse,
        channelFrom,
        channelTo,
      );
    }
    activeTowerShots.clear();
    for (let index = 0; index < towerProjectiles.length; index += 1) {
      const projectile = towerProjectiles[index];
      const zone = siege?.towerZones[index];
      projectile.flight.visible = false;
      if (!zone) continue;
      activeTowerShots.add(zone.id);
      const clock = towerFlightClocks.get(zone.id) ?? {
        seenAt: timeSeconds,
        remaining: zone.detonatesIn,
      };
      if (!towerFlightClocks.has(zone.id)) towerFlightClocks.set(zone.id, clock);
      const remaining = Math.min(
        zone.detonatesIn,
        Math.max(0, clock.remaining - (timeSeconds - clock.seenAt)),
      );
      const progress = Math.max(0, Math.min(1, 1 - remaining / Math.max(0.001, zone.duration)));
      projectile.flight.visible = true;
      projectile.flight.position.set(
        THREE.MathUtils.lerp(zone.fromX - origin.x, zone.x - origin.x, progress),
        THREE.MathUtils.lerp(9.2, 1.15, progress) + Math.sin(progress * Math.PI) * 10,
        THREE.MathUtils.lerp(zone.fromZ - origin.z, zone.z - origin.z, progress),
      );
      projectile.flight.rotation.set(timeSeconds * 4.4, timeSeconds * 3.7, timeSeconds * 2.9);
      projectile.aura.scale.setScalar(0.9 + Math.sin(timeSeconds * 14 + index) * 0.13);
    }
    for (const id of towerFlightClocks.keys()) {
      if (!activeTowerShots.has(id)) towerFlightClocks.delete(id);
    }
  };
  update(null, 0, origin, null);
  return {
    group: root,
    objectiveTargets: [
      fittedGate.root,
      ...wallModels.map((entry) => entry.model),
      ...towerModels,
      ...ramParts.map((entry) => entry.root),
      ...mortarModels.map((entry) => entry.root),
      ...catapultModels.map((entry) => entry.root),
    ],
    update,
  };
}
