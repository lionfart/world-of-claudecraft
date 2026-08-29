import * as THREE from 'three';
import { territorySiegeOrigin } from '../sim/data';
import {
  TERRITORY_SIEGE_BACK_WALL_Z,
  TERRITORY_SIEGE_CORE_ATTACK_RADIUS,
  TERRITORY_SIEGE_CORE_Z,
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
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
  TERRITORY_SIEGE_GATE_MODEL_SCALE,
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
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.035;
  group.add(fill);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.87, radius, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.78,
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
      opacity: 0.025,
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
      opacity: 0.24,
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
      opacity: 0.2,
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
      opacity: 0.9,
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

function aimCylinder(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  const direction = to.clone().sub(from);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.scale.y = direction.length();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

/** Asset-backed seasonal siege field using the existing optimized CC0 castle kit. */
export function buildTerritorySiegePrototype(slot: number): TerritorySiegePrototypeView {
  const root = new THREE.Group();
  root.name = `territory-siege-field:${slot}`;
  const origin = territorySiegeOrigin(slot);
  root.position.set(origin.x, TERRITORY_SIEGE_FLOOR_Y, origin.z);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(TERRITORY_SIEGE_FIELD_HALF_X * 2, TERRITORY_SIEGE_FIELD_HALF_Z * 2),
    surfaceMat({ color: 0x596a3f, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);

  buildTerritorySiegeNaturalField(root);

  const approach = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 98),
    surfaceMat({ color: 0x766044, roughness: 1 }),
  );
  approach.rotation.x = -Math.PI / 2;
  approach.position.set(0, 0.012, 67);
  approach.receiveShadow = true;
  root.add(approach);

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

  const gate = model(
    root,
    'gate',
    [0, 0, TERRITORY_SIEGE_GATE_Z],
    [...TERRITORY_SIEGE_GATE_MODEL_SCALE],
  );
  const gateBaseScale = gate.scale.clone();
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

  const coreBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.2, 1, 8),
    new THREE.MeshBasicMaterial({
      color: 0x78dcff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  coreBeam.visible = false;
  root.add(coreBeam);

  const ramParts = buildRam();
  const ram = ramParts.root;
  ram.position.set(0, 0, 23);
  root.add(ram);
  const ramBuildBeacon = objectiveBeacon(0xe69c35, 8);
  ramBuildBeacon.position.set(0, 0, 27);
  root.add(ramBuildBeacon);

  const towerWarnings = Array.from({ length: 8 }, () => buildTowerWarning());
  for (const warning of towerWarnings) root.add(warning.root);

  const update = (
    siege: TerritorySiegeView | null,
    timeSeconds: number,
    player: { x: number; z: number },
  ): void => {
    const state = territorySiegeVisualState(siege, timeSeconds);
    gate.visible = state.gateVisible;
    gate.scale.set(gateBaseScale.x, gateBaseScale.y * state.gateScaleY, gateBaseScale.z);
    gate.position.y = (1 - state.gateScaleY) * 1.8;
    gateBeacon.visible = state.gateVisible;
    core.scale.setScalar(TERRITORY_SIEGE_CORE_CRYSTAL_SCALE * state.coreScaleY);
    coreRoot.visible = siege !== null;
    for (const range of towerRanges)
      range.visible = !!siege && siege.defenseTowerLevel > 0 && siege.state === 'active';
    ram.visible = state.ramVisible;
    ramBuildBeacon.visible = !!siege && !siege.ramDeployed && !siege.gateOpen;
    ramParts.head.rotation.x = state.ramSwing;
    coreBeam.visible = state.coreChannelVisible;
    if (coreBeam.visible) {
      aimCylinder(
        coreBeam,
        new THREE.Vector3(player.x - origin.x, 1.6, player.z - origin.z),
        new THREE.Vector3(0, 5.1, TERRITORY_SIEGE_CORE_Z),
      );
    }
    for (let index = 0; index < towerWarnings.length; index += 1) {
      const warning = towerWarnings[index];
      const zone = siege?.towerZones[index];
      warning.root.visible = !!zone;
      if (!zone) continue;
      warning.root.position.set(zone.x - origin.x, 0, zone.z - origin.z);
      warning.root.scale.setScalar(zone.radius);
      const urgency = Math.max(0, Math.min(1, 1 - zone.detonatesIn / 1.8));
      warning.ring.rotation.z = timeSeconds * (1.5 + urgency * 3);
      warning.ring.material.opacity = 0.55 + urgency * 0.4;
      warning.fill.material.opacity = 0.12 + urgency * 0.32;
    }
  };
  update(null, 0, origin);
  return { group: root, update };
}
