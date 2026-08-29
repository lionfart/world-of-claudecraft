import * as THREE from 'three';
import { territorySiegeOrigin } from '../sim/data';
import { TERRITORY_SIEGE_FLOOR_Y } from '../sim/territory_siege_layout';
import type { TerritorySiegeView } from '../world_api';
import { surfaceMat } from './gfx';
import { cloneTerritorySiegeAsset, type TerritorySiegeAssetKey } from './territory_siege_assets';
import { territorySiegeVisualState } from './territory_siege_visual_core';

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
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.72, radius, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);
  const light = new THREE.PointLight(color, 3.2, radius * 5, 2);
  light.position.y = 2.5;
  group.add(light);
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
    new THREE.PlaneGeometry(92, 132),
    surfaceMat({ color: 0x596a3f, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);

  const approach = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 112),
    surfaceMat({ color: 0x766044, roughness: 1 }),
  );
  approach.rotation.x = -Math.PI / 2;
  approach.position.set(0, 0.01, 8);
  approach.receiveShadow = true;
  root.add(approach);

  const wallScale: [number, number, number] = [6, 4.55, 2.25];
  for (const x of [-34, 34]) {
    for (const z of [-42, -30, -18, -6, 6, 14]) {
      model(root, 'wall', [x, 0, z], wallScale, Math.PI / 2);
    }
  }
  for (const x of [-30, -18, -6, 6, 18, 30]) {
    model(root, 'wall', [x, 0, -48], wallScale);
  }
  for (const x of [-28, -16, 16, 28]) model(root, 'wall', [x, 0, 18], wallScale);

  for (const x of [-34, 34]) model(root, 'tower', [x, 0, 18], [5.1, 4.4, 5.1]);

  const gate = model(root, 'gate', [0, 0, 17.3], [4, 1.35, 3]);
  const gateBaseScale = gate.scale.clone();
  const gateBeacon = objectiveBeacon(0xd06035, 3.5);
  gateBeacon.position.set(0, 0, 22);
  root.add(gateBeacon);

  model(root, 'castle', [0, 0, -40], [5.3, 4.4, 5.3], Math.PI);
  model(root, 'workshop', [-22, 0, 34], [5.4, 5.4, 5.4], Math.PI / 5);

  const coreRoot = objectiveBeacon(0x55cfff, 7);
  coreRoot.position.set(0, 0, -26);
  root.add(coreRoot);
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 4.1, 1.2, 12),
    surfaceMat({ color: 0x61584b, roughness: 0.85, metalness: 0.15 }),
  );
  pedestal.position.y = 0.6;
  pedestal.castShadow = true;
  coreRoot.add(pedestal);
  const core = model(coreRoot, 'core', [0, 1.15, 0], [4.5, 4.5, 4.5]);
  const coreHalo = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.16, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0x73d8ff, transparent: true, opacity: 0.75 }),
  );
  coreHalo.position.y = 3.2;
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
    core.scale.setScalar(4.5 * state.coreScaleY);
    core.rotation.y = timeSeconds * 0.7;
    coreHalo.rotation.z = timeSeconds * 0.9;
    coreHalo.scale.setScalar(0.9 + Math.sin(timeSeconds * 2.4) * 0.08);
    coreRoot.visible = siege !== null;
    ram.visible = state.ramVisible;
    ramBuildBeacon.visible = !!siege && !siege.ramDeployed && !siege.gateOpen;
    ramParts.head.rotation.x = state.ramSwing;
    coreBeam.visible = state.coreChannelVisible;
    if (coreBeam.visible) {
      aimCylinder(
        coreBeam,
        new THREE.Vector3(player.x - origin.x, 1.6, player.z - origin.z),
        new THREE.Vector3(0, 3.4, -26),
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
