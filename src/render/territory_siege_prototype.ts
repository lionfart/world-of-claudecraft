import * as THREE from 'three';
import { territorySiegeOrigin } from '../sim/data';
import { TERRITORY_SIEGE_FLOOR_Y } from '../sim/territory_siege_layout';
import type { TerritorySiegeView } from '../world_api';
import { surfaceMat } from './gfx';
import { cloneTerritorySiegeAsset, type TerritorySiegeAssetKey } from './territory_siege_assets';
import { territorySiegeVisualState } from './territory_siege_visual_core';

export interface TerritorySiegePrototypeView {
  group: THREE.Group;
  update(siege: TerritorySiegeView | null, timeSeconds: number): void;
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

  model(root, 'castle', [0, 0, -32], [5.3, 4.4, 5.3], Math.PI);
  model(root, 'workshop', [-22, 0, 34], [5.4, 5.4, 5.4], Math.PI / 5);

  const coreRoot = objectiveBeacon(0xe24c3e, 4.2);
  coreRoot.position.set(0, 0, -25);
  root.add(coreRoot);
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.1, 1),
    surfaceMat({
      color: 0xb73b32,
      emissive: 0x4b0907,
      emissiveIntensity: 1.2,
      roughness: 0.42,
    }),
  );
  core.position.y = 3.1;
  core.castShadow = true;
  coreRoot.add(core);

  const ramParts = buildRam();
  const ram = ramParts.root;
  ram.position.set(0, 0, 30);
  root.add(ram);

  const ramp = new THREE.Group();
  ramp.name = 'territory-siege-ramp';
  ramp.position.set(31, 0, 4);
  model(ramp, 'ramp', [0, 0, -12], [1.8, 1.25, 4]);
  root.add(ramp);

  const update = (siege: TerritorySiegeView | null, timeSeconds: number): void => {
    const state = territorySiegeVisualState(siege, timeSeconds);
    gate.visible = state.gateVisible;
    gate.scale.set(gateBaseScale.x, gateBaseScale.y * state.gateScaleY, gateBaseScale.z);
    gate.position.y = (1 - state.gateScaleY) * 1.8;
    gateBeacon.visible = state.gateVisible;
    core.scale.setScalar(state.coreScaleY);
    core.rotation.y = timeSeconds * 0.7;
    coreRoot.visible = siege !== null;
    ram.visible = state.ramVisible;
    ram.position.z = 30 - (siege?.gateProgress ?? 0) * 9;
    ramParts.head.rotation.x = state.ramSwing;
    ramp.visible = state.rampVisible;
  };
  update(null, 0);
  return { group: root, update };
}
