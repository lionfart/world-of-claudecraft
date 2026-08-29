import * as THREE from 'three';
import { territorySiegeOrigin } from '../sim/data';
import {
  TERRITORY_SIEGE_BACK_WALL_Z,
  TERRITORY_SIEGE_CORE_ATTACK_RADIUS,
  TERRITORY_SIEGE_CORE_Z,
  TERRITORY_SIEGE_FLOOR_Y,
  TERRITORY_SIEGE_GATE_Z,
  TERRITORY_SIEGE_TOWER_RANGE,
  TERRITORY_SIEGE_TOWER_X,
  TERRITORY_SIEGE_TOWER_Z,
  TERRITORY_SIEGE_WALL_HALF_X,
} from '../sim/territory_siege_layout';
import type { TerritorySiegeView } from '../world_api';
import { surfaceMat } from './gfx';
import { cloneTerritorySiegeAsset, type TerritorySiegeAssetKey } from './territory_siege_assets';
import {
  buildTerritorySiegeCastleSettlement,
  buildTerritorySiegeNaturalField,
} from './territory_siege_environment';
import {
  TERRITORY_SIEGE_CORE_CRYSTAL_SCALE,
  TERRITORY_SIEGE_GATE_VISUAL_HEIGHT,
  TERRITORY_SIEGE_GATE_VISUAL_WIDTH,
  territorySiegeVisualState,
} from './territory_siege_visual_core';

export interface TerritorySiegePrototypeView {
  group: THREE.Group;
  update(
    siege: TerritorySiegeView | null,
    timeSeconds: number,
    player: { x: number; z: number },
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

function objectiveBeacon(color: number, radius: number): THREE.Group {
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.93, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.025,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.035;
  group.add(fill);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.92, radius, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.055;
  group.add(ring);
  return group;
}

function towerRangeBeacon(radius: number): THREE.Group {
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.985, 64),
    new THREE.MeshBasicMaterial({
      color: 0xd7512d,
      transparent: true,
      opacity: 0.012,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.028;
  group.add(fill);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.24, radius, 72),
    new THREE.MeshBasicMaterial({
      color: 0xf29a55,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.045;
  group.add(ring);
  return group;
}

function buildRam(): { root: THREE.Group; head: THREE.Group } {
  const root = new THREE.Group();
  root.name = 'territory-siege-ram';
  model(root, 'cart', [0, 0, 0], [6.5, 4.4, 5.2], Math.PI);

  const head = new THREE.Group();
  head.position.set(0, 2.8, -1.2);
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

  for (const x of [-1.65, 1.65]) {
    for (const z of [-1.35, 1.35]) {
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

function buildTowerWarning(): {
  root: THREE.Group;
  fill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
} {
  const root = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({
      color: 0xd64b24,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.07;
  root.add(fill);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffb12b,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  root.add(ring);
  root.visible = false;
  return { root, fill, ring };
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

/** Asset-backed seasonal siege field using the existing optimized CC0 castle kit. */
export function buildTerritorySiegePrototype(slot: number): TerritorySiegePrototypeView {
  const root = new THREE.Group();
  root.name = `territory-siege-field:${slot}`;
  const origin = territorySiegeOrigin(slot);
  root.position.set(origin.x, TERRITORY_SIEGE_FLOOR_Y, origin.z);

  buildTerritorySiegeNaturalField(root);

  buildTerritorySiegeCastleSettlement(root);

  const wallScale: [number, number, number] = [6, 4.55, 2.25];
  for (const x of [-TERRITORY_SIEGE_WALL_HALF_X, TERRITORY_SIEGE_WALL_HALF_X]) {
    for (const z of [-66, -54, -42, -30, -18, -6, 6, 14]) {
      model(root, 'wall', [x, 0, z], wallScale, Math.PI / 2);
    }
  }
  for (const x of [-38, -26, -14, 0, 14, 26, 38]) {
    model(root, 'wall', [x, 0, TERRITORY_SIEGE_BACK_WALL_Z], wallScale);
  }
  for (const x of [-38, -26, -16, 16, 26, 38])
    model(root, 'wall', [x, 0, TERRITORY_SIEGE_GATE_Z], wallScale);

  for (const x of [-TERRITORY_SIEGE_TOWER_X, TERRITORY_SIEGE_TOWER_X])
    model(root, 'tower', [x, 0, TERRITORY_SIEGE_TOWER_Z], [5.1, 4.4, 5.1]);

  const towerRanges = [-TERRITORY_SIEGE_TOWER_X, TERRITORY_SIEGE_TOWER_X].map((x) => {
    const range = towerRangeBeacon(TERRITORY_SIEGE_TOWER_RANGE);
    range.position.set(x, 0, TERRITORY_SIEGE_TOWER_Z);
    root.add(range);
    return range;
  });

  const fittedGate = buildFittedGate();
  fittedGate.root.position.set(0, 0, TERRITORY_SIEGE_GATE_Z);
  root.add(fittedGate.root);
  const gateBeacon = objectiveBeacon(0xd06035, 3.5);
  gateBeacon.position.set(0, 0, 22);
  root.add(gateBeacon);

  model(root, 'castle', [0, 0, -63], [5.3, 4.4, 5.3], Math.PI);
  model(root, 'workshop', [-35, 0, -52], [4.4, 4.4, 4.4], Math.PI / 5);

  const coreRoot = objectiveBeacon(0x43c7ff, TERRITORY_SIEGE_CORE_ATTACK_RADIUS);
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

  const coreChannelFx = buildCoreChannelFx();
  root.add(coreChannelFx.root);

  const ramParts = buildRam();
  const ram = ramParts.root;
  ram.position.set(0, 0, 23);
  root.add(ram);
  const ramBuildBeacon = objectiveBeacon(0xe69c35, 8);
  ramBuildBeacon.position.set(0, 0, 27);
  root.add(ramBuildBeacon);

  const towerWarnings = Array.from({ length: 8 }, () => buildTowerWarning());
  for (const warning of towerWarnings) root.add(warning.root);
  const channelFrom = new THREE.Vector3();
  const channelTo = new THREE.Vector3(0, 5.1, TERRITORY_SIEGE_CORE_Z);

  const update = (
    siege: TerritorySiegeView | null,
    timeSeconds: number,
    player: { x: number; z: number },
  ): void => {
    const state = territorySiegeVisualState(siege, timeSeconds);
    fittedGate.leaf.visible = state.gateVisible;
    fittedGate.leaf.scale.y = state.gateScaleY;
    gateBeacon.visible = state.gateVisible;
    core.scale.setScalar(TERRITORY_SIEGE_CORE_CRYSTAL_SCALE * state.coreScaleY);
    coreRoot.visible = siege !== null;
    for (const range of towerRanges)
      range.visible = !!siege && siege.defenseTowerLevel > 0 && siege.state === 'active';
    ram.visible = state.ramVisible;
    ramBuildBeacon.visible = !!siege && !siege.ramDeployed && !siege.gateOpen;
    ramParts.head.rotation.x = state.ramSwing;
    coreHalo.rotation.z = timeSeconds * 0.55;
    coreHalo.scale.setScalar(0.92 + state.coreChannelPulse * 0.16);
    channelFrom.set(player.x - origin.x, 1.6, player.z - origin.z);
    coreChannelFx.update(
      state.coreChannelVisible,
      timeSeconds,
      state.coreChannelPulse,
      channelFrom,
      channelTo,
    );
    for (let index = 0; index < towerWarnings.length; index += 1) {
      const warning = towerWarnings[index];
      const zone = siege?.towerZones[index];
      warning.root.visible = !!zone;
      if (!zone) continue;
      warning.root.position.set(zone.x - origin.x, 0, zone.z - origin.z);
      warning.root.scale.setScalar(zone.radius);
      const urgency = Math.max(0, Math.min(1, 1 - zone.detonatesIn / 1.8));
      warning.ring.rotation.z = timeSeconds * (1.5 + urgency * 3);
      warning.ring.material.opacity = 0.25 + urgency * 0.38;
      warning.fill.material.opacity = 0.045 + urgency * 0.18;
    }
  };
  update(null, 0, origin);
  return { group: root, update };
}
