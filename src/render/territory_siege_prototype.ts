import * as THREE from 'three';
import { territorySiegeOrigin } from '../sim/data';
import { TERRITORY_SIEGE_FLOOR_Y } from '../sim/territory_siege_layout';
import type { TerritorySiegeView } from '../world_api';
import { surfaceMat } from './gfx';
import { territorySiegeVisualState } from './territory_siege_visual_core';

export interface TerritorySiegePrototypeView {
  group: THREE.Group;
  update(siege: TerritorySiegeView | null, timeSeconds: number): void;
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Low-poly fallback field used until production siege GLBs are supplied. */
export function buildTerritorySiegePrototype(slot: number): TerritorySiegePrototypeView {
  const root = new THREE.Group();
  root.name = `territory-siege-prototype:${slot}`;
  const origin = territorySiegeOrigin(slot);
  root.position.set(origin.x, TERRITORY_SIEGE_FLOOR_Y, origin.z);

  const ground = surfaceMat({ color: 0x52613c, roughness: 1 });
  const stone = surfaceMat({ color: 0x777267, roughness: 0.95 });
  const darkStone = surfaceMat({ color: 0x4c4944, roughness: 0.92 });
  const wood = surfaceMat({ color: 0x5a351e, roughness: 0.88 });
  const iron = surfaceMat({ color: 0x34373b, roughness: 0.55, metalness: 0.55 });
  const coreMat = surfaceMat({
    color: 0x8c352d,
    emissive: 0x2a0805,
    emissiveIntensity: 0.55,
    roughness: 0.62,
  });

  box(root, [92, 0.35, 132], [0, -0.2, 0], ground).receiveShadow = true;
  box(root, [4, 5, 86], [-34, 2.5, -5], stone);
  box(root, [4, 5, 86], [34, 2.5, -5], stone);
  box(root, [72, 5, 4], [0, 2.5, -48], stone);
  box(root, [24, 5, 4], [-22, 2.5, 18], stone);
  box(root, [24, 5, 4], [22, 2.5, 18], stone);

  for (const x of [-34, 34]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 9, 10), darkStone);
    tower.position.set(x, 4.5, 18);
    tower.castShadow = true;
    tower.receiveShadow = true;
    root.add(tower);
  }

  const gate = box(root, [16, 5, 1.3], [0, 2.5, 18], wood);
  for (const x of [-6, -2, 2, 6]) box(gate, [0.35, 5, 1.5], [x, 0, 0], iron);

  const keep = new THREE.Group();
  keep.position.set(0, 0, -28);
  root.add(keep);
  box(keep, [16, 9, 14], [0, 4.5, 0], darkStone);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.3, 0), coreMat);
  core.position.set(0, 7, 0);
  core.castShadow = true;
  keep.add(core);

  const ram = new THREE.Group();
  ram.position.set(0, 1.5, 34);
  root.add(ram);
  box(ram, [8, 0.5, 4.8], [0, -1, 0], wood);
  const ramHead = new THREE.Group();
  ram.add(ramHead);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 8, 8), wood);
  beam.rotation.x = Math.PI / 2;
  ramHead.add(beam);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 8), iron);
  cap.rotation.x = -Math.PI / 2;
  cap.position.z = -4.8;
  ramHead.add(cap);

  const ramp = new THREE.Group();
  ramp.position.set(31, 0, 4);
  ramp.rotation.x = -Math.atan2(5, 24);
  root.add(ramp);
  box(ramp, [6, 0.55, 24], [0, 0.3, 0], wood);
  for (let z = -10; z <= 10; z += 2) box(ramp, [6.2, 0.35, 0.35], [0, 0.65, z], iron);

  const update = (siege: TerritorySiegeView | null, timeSeconds: number): void => {
    const state = territorySiegeVisualState(siege, timeSeconds);
    gate.visible = state.gateVisible;
    gate.scale.y = state.gateScaleY;
    core.scale.y = state.coreScaleY;
    ram.visible = state.ramVisible;
    ramHead.rotation.x = state.ramSwing;
    ramp.visible = state.rampVisible;
  };
  update(null, 0);
  return { group: root, update };
}
